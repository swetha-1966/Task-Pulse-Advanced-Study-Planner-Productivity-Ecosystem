from flask import Flask, render_template, request, jsonify, redirect, Response
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from database import db, User, StudyPlan, Task, ProgressTracker, SubTask, Habit, HabitLog, PlanCollaborator, InviteToken
from functools import wraps
import os, csv, secrets, random
from io import StringIO
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = 'super-secret-taskpulse-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///taskpulse_v6.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'): return jsonify({"error": "Unauthorized."}), 401
    return redirect('/login')

with app.app_context():
    db.create_all()
    if not User.query.filter_by(email='admin@taskpulse.com').first():
        admin = User(name='System Admin', email='admin@taskpulse.com', password=generate_password_hash('admin123'), is_admin=True, onboarding_done=True)
        db.session.add(admin); db.session.commit()

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

# ── Page Routes ──────────────────────────────────────────────
@app.route('/login')
def login_page():
    if current_user.is_authenticated: return redirect('/')
    return render_template('login.html')

@app.route('/register')
def register_page():
    if current_user.is_authenticated: return redirect('/')
    return render_template('register.html')

@app.route('/')
def index():
    if not current_user.is_authenticated: return render_template('landing.html')
    return render_template('index.html')

@app.route('/admin')
@login_required
def admin_dashboard():
    if not current_user.is_admin: return redirect('/')
    return render_template('admin.html')

@app.route('/invite/<token>')
def accept_invite_page(token):
    """If logged in: process immediately. If not: save token in session and redirect to register."""
    if not current_user.is_authenticated:
        # Save invite token in session so we can process it after login/register
        from flask import session
        session['pending_invite'] = token
        return redirect(f'/register?invite={token}')

    # User is already logged in — process invite right now
    _process_invite(token, current_user)
    return redirect('/?joined=1')

def _process_invite(token, user):
    """Core logic: validate token and add collaborator."""
    from flask import session
    inv = InviteToken.query.filter_by(token=token).first()
    if not inv:
        return False
    if datetime.now() > datetime.strptime(inv.expires_at, '%Y-%m-%d %H:%M:%S'):
        db.session.delete(inv); db.session.commit()
        return False
    # Don't add owner as collaborator
    plan = StudyPlan.query.get(inv.planID)
    if plan and plan.userID == user.userID:
        db.session.delete(inv); db.session.commit()
        return False
    existing = PlanCollaborator.query.filter_by(planID=inv.planID, userID=user.userID).first()
    if not existing:
        db.session.add(PlanCollaborator(planID=inv.planID, userID=user.userID, role='editor'))
    db.session.delete(inv); db.session.commit()
    return True

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    from flask import session
    data = request.json
    if User.query.filter_by(email=data.get('email')).first():
        return jsonify({"error": "Email already registered"}), 400
    user = User(name=data.get('name'), email=data.get('email'), password=generate_password_hash(data.get('password')))
    db.session.add(user); db.session.commit()
    login_user(user)
    # Process any pending invite from session
    joined_plan = False
    invite_token = session.pop('pending_invite', None) or data.get('invite_token')
    if invite_token:
        joined_plan = _process_invite(invite_token, user)
    return jsonify({"success": True, "first_login": True, "joined_plan": joined_plan}), 201

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    from flask import session
    data = request.json
    user = User.query.filter_by(email=data.get('email')).first()
    if user and check_password_hash(user.password, data.get('password')):
        login_user(user)
        # Process any pending invite from session
        joined_plan = False
        invite_token = session.pop('pending_invite', None) or data.get('invite_token')
        if invite_token:
            joined_plan = _process_invite(invite_token, user)
        return jsonify({"success": True, "name": user.name, "joined_plan": joined_plan, "is_admin": user.is_admin})
    return jsonify({"error": "Invalid email or password"}), 401

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user(); return jsonify({"success": True})

# ── User API ──────────────────────────────────────────────────
@app.route('/api/user')
@login_required
def get_user():
    return jsonify({
        "userID": current_user.userID, "name": current_user.name,
        "email": current_user.email, "is_admin": current_user.is_admin,
        "streak": current_user.current_streak, "onboarding_done": current_user.onboarding_done
    })

@app.route('/api/user/onboarding', methods=['POST'])
@login_required
def complete_onboarding():
    current_user.onboarding_done = True; db.session.commit()
    return jsonify({"success": True})

@app.route('/api/user/settings', methods=['PUT'])
@login_required
def update_settings():
    data = request.json
    if data.get('name'): current_user.name = data['name']
    if data.get('email'):
        ex = User.query.filter_by(email=data['email']).first()
        if ex and ex.userID != current_user.userID: return jsonify({"error": "Email in use"}), 400
        current_user.email = data['email']
    if data.get('password'): current_user.password = generate_password_hash(data['password'])
    if 'email_reminders' in data: current_user.email_reminders = data['email_reminders']
    if 'smtp_email' in data: current_user.smtp_email = data['smtp_email']
    if 'smtp_password' in data: current_user.smtp_password = data['smtp_password']
    db.session.commit()
    return jsonify({"success": True, "name": current_user.name})

# ── Plans API ──────────────────────────────────────────────────
@app.route('/api/plans')
@login_required
def get_plans():
    own = StudyPlan.query.filter_by(userID=current_user.userID).all()
    collab_ids = [c.planID for c in PlanCollaborator.query.filter_by(userID=current_user.userID).all()]
    collab_plans = StudyPlan.query.filter(StudyPlan.planID.in_(collab_ids)).all() if collab_ids else []
    all_plans = own + collab_plans
    return jsonify([{"planID": p.planID, "title": p.title, "createdDate": p.createdDate,
                     "isOwner": p.userID == current_user.userID} for p in all_plans])

@app.route('/api/plans', methods=['POST'])
@login_required
def create_plan():
    data = request.json
    plan = StudyPlan(userID=current_user.userID, title=data.get('title'), createdDate=data.get('createdDate',''))
    db.session.add(plan); db.session.flush()
    template = data.get('template'); today = datetime.now()
    templates = {
        'software_eng': [
            ("Requirements Gathering", 2, "High", "Hard"),
            ("Database Architecture Setup", 4, "High", "Medium"),
            ("Develop Core APIs", 7, "Medium", "Hard"),
            ("Frontend UI Implementation", 10, "Medium", "Medium"),
            ("System Deployment & Testing", 14, "High", "Hard")
        ],
        'exam_prep': [
            ("Organize Class Notes", 1, "Medium", "Easy"),
            ("Review Flashcards (Ch 1-3)", 2, "High", "Medium"),
            ("Take Practice Test A", 4, "High", "Hard"),
            ("Review Weak Areas", 5, "Medium", "Medium"),
            ("Final Exam Day", 7, "High", "Hard")
        ]
    }
    if template in templates:
        for title, days, pri, diff in templates[template]:
            t = Task(planID=plan.planID, title=title, deadline=(today+timedelta(days=days)).strftime('%Y-%m-%d'),
                     priority=pri, difficulty=diff, status='Pending', tags=template.replace('_',','))
            db.session.add(t); db.session.flush()
            db.session.add(ProgressTracker(taskID=t.taskID, progress=0, timeSpent=0))
    db.session.commit()
    return jsonify({"planID": plan.planID, "title": plan.title, "createdDate": plan.createdDate}), 201

@app.route('/api/plans/<int:plan_id>', methods=['DELETE'])
@login_required
def delete_plan(plan_id):
    plan = StudyPlan.query.filter_by(planID=plan_id, userID=current_user.userID).first()
    if plan: db.session.delete(plan); db.session.commit()
    return jsonify({"success": True})

@app.route('/api/plans/<int:plan_id>/invite', methods=['POST'])
@login_required
def generate_invite(plan_id):
    plan = StudyPlan.query.filter_by(planID=plan_id, userID=current_user.userID).first()
    if not plan: return jsonify({"error": "Not found"}), 404
    token = secrets.token_hex(16)
    expires = (datetime.now() + timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
    db.session.add(InviteToken(token=token, planID=plan_id, inviterID=current_user.userID, expires_at=expires))
    db.session.commit()
    link = f"{request.host_url}invite/{token}"
    return jsonify({"link": link})

# ── Tasks API ──────────────────────────────────────────────────
@app.route('/api/plans/<int:plan_id>/tasks')
@login_required
def get_tasks(plan_id):
    plan = StudyPlan.query.get(plan_id)
    if not plan: return jsonify({"error": "Not found"}), 404
    tasks = []
    for t in plan.tasks:
        tasks.append({
            "taskID": t.taskID, "planID": t.planID, "title": t.title,
            "deadline": t.deadline, "priority": t.priority, "status": t.status,
            "notes": t.notes, "difficulty": t.difficulty, "tags": t.tags,
            "progress": t.progress.progress if t.progress else 0,
            "timeSpent": t.progress.timeSpent if t.progress else 0,
            "subtasks": [{"subtaskID": s.subtaskID, "title": s.title, "is_completed": s.is_completed} for s in t.subtasks]
        })
    return jsonify(tasks)

@app.route('/api/all_tasks')
@login_required
def get_all_tasks():
    plan_ids = [p.planID for p in StudyPlan.query.filter_by(userID=current_user.userID).all()]
    return jsonify([{"taskID": t.taskID, "title": t.title, "deadline": t.deadline,
                     "status": t.status, "planTitle": t.plan.title}
                    for t in Task.query.filter(Task.planID.in_(plan_ids)).all()])

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    plan = StudyPlan.query.filter_by(planID=data.get('planID'), userID=current_user.userID).first()
    if not plan: return jsonify({"error": "Plan not found"}), 404
    t = Task(planID=data['planID'], title=data.get('title'), deadline=data.get('deadline'),
             priority=data.get('priority','Medium'), difficulty=data.get('difficulty','Medium'), tags=data.get('tags',''))
    db.session.add(t); db.session.flush()
    db.session.add(ProgressTracker(taskID=t.taskID, progress=0, timeSpent=0))
    db.session.commit()
    return jsonify({"taskID": t.taskID, "title": t.title}), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    data = request.json
    task = Task.query.get(task_id)
    if not task or task.plan.userID != current_user.userID: return jsonify({"error": "Not found"}), 404

    def bump_streak():
        today_str = datetime.now().strftime('%Y-%m-%d')
        if current_user.last_activity_date == today_str: return
        if current_user.last_activity_date:
            last = datetime.strptime(current_user.last_activity_date, '%Y-%m-%d')
            current_user.current_streak = current_user.current_streak + 1 if (datetime.now()-last).days == 1 else 1
        else: current_user.current_streak = 1
        current_user.last_activity_date = today_str

    if 'status' in data:
        task.status = data['status']
        if data['status'] == 'Completed': bump_streak()
    for field in ['priority','notes','difficulty','title','deadline','tags']:
        if field in data: setattr(task, field, data[field])
    if 'progress' in data or 'timeSpent' in data:
        prog = task.progress or ProgressTracker(taskID=task_id, progress=0, timeSpent=0)
        if not task.progress: db.session.add(prog)
        if data.get('progress') is not None:
            prog.progress = data['progress']
            if prog.progress == 100: task.status = 'Completed'; bump_streak()
            elif prog.progress > 0 and task.status == 'Pending': task.status = 'In Progress'
        if data.get('timeSpent') is not None: prog.timeSpent += data['timeSpent']; bump_streak()
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task = Task.query.get(task_id)
    if task and task.plan.userID == current_user.userID: db.session.delete(task); db.session.commit()
    return jsonify({"success": True})

# ── FEATURE 1: AI Task Breakdown ──────────────────────────────
AI_TEMPLATES = {
    'machine learning': ['Gather & clean dataset','EDA & visualization','Feature engineering','Train baseline model','Tune hyperparameters','Evaluate & document results'],
    'web': ['Design wireframes & UI','Set up project & dependencies','Build backend APIs','Develop frontend pages','Write tests','Deploy to production'],
    'database': ['Define requirements','Design ERD schema','Create tables & relations','Write CRUD queries','Optimize indexes','Test & document'],
    'research': ['Define research question','Literature review','Collect data/sources','Analyze findings','Write draft','Revise & finalize'],
    'exam': ['Gather study materials','Create summary notes','Make flashcards','Take practice tests','Review weak topics','Final revision'],
    'project': ['Define scope & goals','Break into milestones','Assign resources','Execute Phase 1','Review & iterate','Final delivery'],
}

@app.route('/api/ai/breakdown', methods=['POST'])
@login_required
def ai_breakdown():
    title = request.json.get('title','').lower()
    today = datetime.now()
    matched = None
    for key, tasks in AI_TEMPLATES.items():
        if key in title: matched = tasks; break
    if not matched:
        matched = ['Define the scope & goals','Research and gather resources',
                   'Create a detailed outline','Execute the main work',
                   'Review and test your output','Submit / finalize deliverable']
    subtasks = []
    for i, t in enumerate(matched):
        subtasks.append({"title": t, "deadline": (today + timedelta(days=(i+1)*2)).strftime('%Y-%m-%d'),
                         "priority": "High" if i < 2 else "Medium"})
    return jsonify({"subtasks": subtasks})

# ── FEATURE 3: Email Reminders ────────────────────────────────
@app.route('/api/reminders/send', methods=['POST'])
@login_required
def send_test_reminder():
    if not current_user.smtp_email or not current_user.smtp_password:
        return jsonify({"error": "Please configure your email in Settings first."}), 400
    try:
        import smtplib
        from email.mime.text import MIMEText
        plans = StudyPlan.query.filter_by(userID=current_user.userID).all()
        plan_ids = [p.planID for p in plans]
        tasks = Task.query.filter(Task.planID.in_(plan_ids)).all()
        risky = []
        for t in tasks:
            if t.status == 'Completed' or not t.deadline: continue
            try:
                days_left = (datetime.strptime(t.deadline,'%Y-%m-%d') - datetime.now()).days
                if days_left <= 3: risky.append(f"⚠️ '{t.title}' — {days_left} day(s) left")
            except: pass
        if not risky: return jsonify({"message": "No risky tasks to remind you about!"})
        body = f"Hi {current_user.name},\n\nYou have {len(risky)} deadline(s) approaching soon:\n\n" + "\n".join(risky) + "\n\nKeep going! — TaskPulse"
        msg = MIMEText(body)
        msg['Subject'] = '⚠️ TaskPulse Deadline Alert'
        msg['From'] = current_user.smtp_email
        msg['To'] = current_user.email
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(current_user.smtp_email, current_user.smtp_password)
            server.send_message(msg)
        return jsonify({"success": True, "message": f"Email sent! {len(risky)} risk alerts delivered."})
    except Exception as e:
        return jsonify({"error": f"Email failed: {str(e)}"}), 500

# ── FEATURE 4: Habit Tracker ──────────────────────────────────
@app.route('/api/habits')
@login_required
def get_habits():
    habits = Habit.query.filter_by(userID=current_user.userID).all()
    today = datetime.now().strftime('%Y-%m-%d')
    result = []
    for h in habits:
        logs_7 = [l.log_date for l in h.logs]
        streak = 0
        for i in range(30):
            d = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            if d in logs_7: streak += 1
            else: break
        result.append({"habitID": h.habitID, "title": h.title, "icon": h.icon,
                        "done_today": today in logs_7, "streak": streak})
    return jsonify(result)

@app.route('/api/habits', methods=['POST'])
@login_required
def create_habit():
    data = request.json
    h = Habit(userID=current_user.userID, title=data.get('title',''), icon=data.get('icon','✅'))
    db.session.add(h); db.session.commit()
    return jsonify({"habitID": h.habitID, "title": h.title, "icon": h.icon}), 201

@app.route('/api/habits/<int:habit_id>/log', methods=['POST'])
@login_required
def log_habit(habit_id):
    h = Habit.query.filter_by(habitID=habit_id, userID=current_user.userID).first()
    if not h: return jsonify({"error": "Not found"}), 404
    today = datetime.now().strftime('%Y-%m-%d')
    existing = HabitLog.query.filter_by(habitID=habit_id, log_date=today).first()
    if existing: db.session.delete(existing)
    else: db.session.add(HabitLog(habitID=habit_id, log_date=today))
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/habits/<int:habit_id>', methods=['DELETE'])
@login_required
def delete_habit(habit_id):
    h = Habit.query.filter_by(habitID=habit_id, userID=current_user.userID).first()
    if h: db.session.delete(h); db.session.commit()
    return jsonify({"success": True})

# ── Dashboard & Export ────────────────────────────────────────
@app.route('/api/dashboard')
@login_required
def get_dashboard():
    plans = StudyPlan.query.filter_by(userID=current_user.userID).all()
    plan_ids = [p.planID for p in plans]
    if not plan_ids:
        return jsonify({"totalTasks":0,"completedTasks":0,"pendingTasks":0,"totalTimeSpent":0,"tasksForRiskCalc":[]})
    tasks = Task.query.filter(Task.planID.in_(plan_ids)).all()
    completed = sum(1 for t in tasks if t.status == 'Completed')
    return jsonify({"totalTasks": len(tasks), "completedTasks": completed,
                    "pendingTasks": len(tasks)-completed,
                    "totalTimeSpent": sum(t.progress.timeSpent for t in tasks if t.progress),
                    "tasksForRiskCalc": [{"status": t.status, "deadline": t.deadline} for t in tasks]})

@app.route('/api/export/csv')
@login_required
def export_csv():
    plans = StudyPlan.query.filter_by(userID=current_user.userID).all()
    tasks = Task.query.filter(Task.planID.in_([p.planID for p in plans])).all()
    def generate():
        buf = StringIO()
        w = csv.writer(buf)
        w.writerow(['Task ID','Plan','Title','Status','Priority','Deadline','Progress','Time (min)','Tags'])
        yield buf.getvalue(); buf.seek(0); buf.truncate(0)
        for t in tasks:
            w.writerow([t.taskID, t.plan.title, t.title, t.status, t.priority, t.deadline,
                        t.progress.progress if t.progress else 0, t.progress.timeSpent if t.progress else 0, t.tags])
            yield buf.getvalue(); buf.seek(0); buf.truncate(0)
    return Response(generate(), mimetype='text/csv', headers={"Content-Disposition":"attachment; filename=taskpulse-report.csv"})

# ── Admin API ──────────────────────────────────────────────────
@app.route('/api/admin/stats')
@admin_required
def admin_stats():
    users = []
    for u in User.query.all():
        users.append({"userID": u.userID, "name": u.name, "email": u.email,
                      "is_admin": u.is_admin, "totalPlans": StudyPlan.query.filter_by(userID=u.userID).count()})
    return jsonify({"totalUsers": User.query.count(), "totalPlans": StudyPlan.query.count(),
                    "totalTasks": Task.query.count(),
                    "totalTimeSpent": sum(p.timeSpent for p in ProgressTracker.query.all()), "users": users})

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == current_user.userID: return jsonify({"error": "Cannot delete yourself"}), 400
    u = User.query.get(user_id)
    if u: db.session.delete(u); db.session.commit()
    return jsonify({"success": True})

# ── Subtasks API ──────────────────────────────────────────────
@app.route('/api/tasks/<int:task_id>/subtasks', methods=['POST'])
@login_required
def add_subtask(task_id):
    task = Task.query.get(task_id)
    if not task: return jsonify({"error": "Not found"}), 404
    s = SubTask(taskID=task_id, title=request.json.get('title',''))
    db.session.add(s); db.session.commit()
    return jsonify({"subtaskID": s.subtaskID, "title": s.title, "is_completed": False}), 201

@app.route('/api/subtasks/<int:subtask_id>', methods=['PUT','DELETE'])
@login_required
def handle_subtask(subtask_id):
    s = SubTask.query.get(subtask_id)
    if not s: return jsonify({"error": "Not found"}), 404
    if request.method == 'DELETE':
        db.session.delete(s); db.session.commit(); return jsonify({"success": True})
    if 'is_completed' in request.json: s.is_completed = request.json['is_completed']
    db.session.commit(); return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
