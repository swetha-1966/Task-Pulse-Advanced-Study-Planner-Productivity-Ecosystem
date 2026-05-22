from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

db = SQLAlchemy()

class User(UserMixin, db.Model):
    userID = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    current_streak = db.Column(db.Integer, default=0)
    last_activity_date = db.Column(db.String(50), default='')
    onboarding_done = db.Column(db.Boolean, default=False)
    email_reminders = db.Column(db.Boolean, default=False)
    smtp_email = db.Column(db.String(200), default='')
    smtp_password = db.Column(db.String(200), default='')

    def get_id(self):
        return str(self.userID)

class StudyPlan(db.Model):
    planID = db.Column(db.Integer, primary_key=True)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    createdDate = db.Column(db.String(50), nullable=False)
    tasks = db.relationship('Task', backref='plan', lazy=True, cascade="all, delete-orphan")
    collaborators = db.relationship('PlanCollaborator', backref='plan', lazy=True, cascade="all, delete-orphan")

class PlanCollaborator(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    planID = db.Column(db.Integer, db.ForeignKey('study_plan.planID'), nullable=False)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    role = db.Column(db.String(50), default='viewer')  # viewer or editor

class InviteToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False)
    planID = db.Column(db.Integer, db.ForeignKey('study_plan.planID'), nullable=False)
    inviterID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    expires_at = db.Column(db.String(50), nullable=False)

class Task(db.Model):
    taskID = db.Column(db.Integer, primary_key=True)
    planID = db.Column(db.Integer, db.ForeignKey('study_plan.planID'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    deadline = db.Column(db.String(50))
    priority = db.Column(db.String(50), default='Medium')
    status = db.Column(db.String(50), default='Pending')
    notes = db.Column(db.Text, default='')
    difficulty = db.Column(db.String(50), default='Medium')
    tags = db.Column(db.String(200), default='')

    progress = db.relationship('ProgressTracker', backref='task', uselist=False, cascade="all, delete-orphan")
    subtasks = db.relationship('SubTask', backref='task', lazy=True, cascade="all, delete-orphan")

class SubTask(db.Model):
    subtaskID = db.Column(db.Integer, primary_key=True)
    taskID = db.Column(db.Integer, db.ForeignKey('task.taskID'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    is_completed = db.Column(db.Boolean, default=False)

class ProgressTracker(db.Model):
    taskID = db.Column(db.Integer, db.ForeignKey('task.taskID'), primary_key=True)
    progress = db.Column(db.Integer, default=0)
    timeSpent = db.Column(db.Integer, default=0)

class Report(db.Model):
    reportID = db.Column(db.Integer, primary_key=True)
    week = db.Column(db.String(50))
    totalTasks = db.Column(db.Integer)
    completedTasks = db.Column(db.Integer)
    timeSpent = db.Column(db.Integer)

# Feature 4: Habit Tracker
class Habit(db.Model):
    habitID = db.Column(db.Integer, primary_key=True)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    icon = db.Column(db.String(10), default='✅')
    logs = db.relationship('HabitLog', backref='habit', lazy=True, cascade="all, delete-orphan")

class HabitLog(db.Model):
    logID = db.Column(db.Integer, primary_key=True)
    habitID = db.Column(db.Integer, db.ForeignKey('habit.habitID'), nullable=False)
    log_date = db.Column(db.String(20), nullable=False)
