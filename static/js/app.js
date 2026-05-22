document.addEventListener('DOMContentLoaded', () => {
    // ---- STATE ----
    let currentUser = null;
    let currentPlans = [];
    let currentTasks = [];
    let currentChart = null;
    let calendar = null;
    let quill = null;

    // Timer state
    let timerInterval = null;
    let timeLeft = 25 * 60; // 25 mins
    let timerRunning = false;

    // ---- DOM ELEMENTS ----
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.view-section');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // ---- INITIALIZATION ----
    initApp();

    // Show success toast if user just joined via invite link
    if(new URLSearchParams(window.location.search).get('joined') === '1') {
        setTimeout(() => showToast('🎉 You joined a shared study plan! Check Study Plans.', 'success', 'fa-users'), 1500);
        // Clean URL without reload
        window.history.replaceState({}, '', '/');
    }

    async function initApp() {
        showDate();
        loadTheme();
        initQuill();
        
        // Request Notification Permission
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
        
        // Fetch User
        try {
            const res = await fetch('/api/user');
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (res.ok) {
                currentUser = await res.json();
                document.getElementById('welcome-msg').innerText = `Welcome back, ${currentUser.name}!`;
                
                if(currentUser.streak > 0) {
                    document.getElementById('streak-display').innerText = `🔥 ${currentUser.streak} Day Streak!`;
                } else {
                    document.getElementById('streak-display').innerText = '';
                }
                
                if (currentUser.is_admin) {
                    const adminNav = document.getElementById('nav-admin');
                    adminNav.style.display = 'flex';
                    adminNav.addEventListener('click', () => window.location.href = '/admin');
                }
            }
        } catch (e) {
            console.error(e);
        }

        // Default to Dashboard
        await refreshDashboard();
        
        // Setup listeners
        setupNavigation();
        setupModals();
        setupDragAndDrop();
        setupTimer();
        setupForms();
        setupAudioPlayer();
        setupExport();
        setupEmailReminder();
        setupOnboarding();
        
        // Setup Logout
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        });
    }

    function showDate() {
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('date-display').innerText = new Date().toLocaleDateString(undefined, dateOptions);
    }

    function initQuill() {
        quill = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: 'Type your detailed notes, links, and study materials here...',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            }
        });
    }

    // ---- NAVIGATION ----
    function setupNavigation() {
        navLinks.forEach(link => {
            link.addEventListener('click', async () => {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                const targetView = link.getAttribute('data-view');
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById(targetView).classList.add('active');

                // View specific logic
                if (targetView === 'study-plans') await loadStudyPlans();
                if (targetView === 'tasks') await loadTasksView();
                if (targetView === 'dashboard') await refreshDashboard();
                if (targetView === 'calendar-view') await renderCalendar();
                if (targetView === 'habits') await loadHabits();
            });
        });
    }

    // ---- THEME ----
    function loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
            if(calendar) calendar.render(); 
        });
    }

    // ---- MODALS & FORMS ----
    function setupModals() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').style.display = 'none';
            });
        });

        window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = "none";
            }
        }

        document.getElementById('btn-create-plan').addEventListener('click', () => {
            document.getElementById('modal-plan').style.display = 'flex';
        });

        document.getElementById('btn-add-task').addEventListener('click', () => {
            document.getElementById('modal-task').style.display = 'flex';
            document.getElementById('form-task').reset();
            document.getElementById('task-id').value = '';
        });
    }

    function setupForms() {
        // Plan Form
        document.getElementById('form-plan').addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('plan-title').value;
            const template = document.getElementById('plan-template').value;
            const createdDate = new Date().toISOString().split('T')[0];
            
            await fetch('/api/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, template, createdDate })
            });
            document.getElementById('modal-plan').style.display = 'none';
            document.getElementById('form-plan').reset();
            showToast("Plan created successfully!", "success");
            await loadStudyPlans();
        });

        // Task Form
        document.getElementById('form-task').addEventListener('submit', async (e) => {
            e.preventDefault();
            const planID = document.getElementById('filter-plan').value;
            if(!planID) return showToast("Select a study plan first", "error", "fa-circle-xmark");

            const title = document.getElementById('task-title').value;
            const deadline = document.getElementById('task-deadline').value;
            const priority = document.getElementById('task-priority').value;
            const difficulty = document.getElementById('task-difficulty').value;
            const tags = document.getElementById('task-tags').value;

            await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planID, title, deadline, priority, difficulty, tags })
            });

            document.getElementById('modal-task').style.display = 'none';
            showToast("Task created successfully!", "success", "fa-check-circle");
            await loadTasksView();
        });
        
        // Task Details Update
        document.getElementById('btn-save-details').addEventListener('click', async () => {
            const taskId = document.getElementById('btn-save-details').dataset.taskId;
            const progress = document.getElementById('task-progress-slider').value;
            const notes = quill.root.innerHTML;
            
            await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ progress: parseInt(progress), notes })
            });
            document.getElementById('modal-task-details').style.display = 'none';
            showToast("Task updated!", "success", "fa-check-circle");
            await loadTasksView();
        });
        
        document.getElementById('task-progress-slider').addEventListener('input', (e) => {
            document.getElementById('task-progress-value').innerText = e.target.value;
        });
        
        document.getElementById('btn-delete-task').addEventListener('click', async() => {
            if(!confirm("Are you sure?")) return;
            const taskId = document.getElementById('btn-save-details').dataset.taskId;
            await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
            document.getElementById('modal-task-details').style.display = 'none';
            showToast("Task deleted", "info");
            await loadTasksView();
        });
        
        // Settings Form
        const formSettings = document.getElementById('form-settings');
        if (formSettings) {
            formSettings.addEventListener('submit', async (e) => {
                e.preventDefault();
                const Name = document.getElementById('settings-name').value;
                const Email = document.getElementById('settings-email').value;
                const Pass = document.getElementById('settings-password').value;
                
                const payload = {};
                if(Name) payload.name = Name;
                if(Email) payload.email = Email;
                if(Pass) payload.password = Pass;
                
                if(Object.keys(payload).length === 0) {
                    showToast("No changes entered", "warning"); return;
                }
                
                try {
                    const res = await fetch('/api/user/settings', {
                        method: 'PUT', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                    const d = await res.json();
                    if(res.ok) {
                        showToast("Profile settings updated!", "success");
                        document.getElementById('welcome-msg').innerText = `Welcome back, ${d.name}!`;
                        formSettings.reset();
                    } else {
                        showToast(d.error || "Failed to update profile", "error");
                    }
                } catch(e) { console.error(e); }
            });
        }
    }

    // ---- DASHBOARD & EXPORT ----
    async function refreshDashboard() {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        
        document.getElementById('dash-total-tasks').innerText = data.totalTasks;
        document.getElementById('dash-completed-tasks').innerText = data.completedTasks;
        document.getElementById('dash-pending-tasks').innerText = data.pendingTasks;
        document.getElementById('dash-time-spent').innerText = data.totalTimeSpent;
        
        let highRiskCount = 0;
        data.tasksForRiskCalc.forEach(t => {
            const risk = calculateRisk(t.status, t.deadline);
            if(risk.level === 'Critical' || risk.level === 'High Risk') highRiskCount++;
        });
        document.getElementById('dash-risk-tasks').innerText = highRiskCount;
        
        renderChart(data.completedTasks, data.pendingTasks, highRiskCount);
    }
    
    function setupExport() {
        document.getElementById('btn-export-csv').addEventListener('click', () => {
            window.open('/api/export/csv', '_blank');
            showToast("Exporting report...", "info", "fa-download");
        });
    }

    function renderChart(completed, pending, risky) {
        const ctx = document.getElementById('progressChart').getContext('2d');
        if(currentChart) currentChart.destroy();
        
        currentChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending', 'Risky'],
                datasets: [{
                    data: [completed, pending, risky],
                    backgroundColor: ['#2ec4b6', '#4cc9f0', '#e63946']
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    // ---- CALENDAR ----
    async function renderCalendar() {
        const res = await fetch('/api/all_tasks');
        const tasks = await res.json();
        
        const events = tasks.filter(t => t.deadline).map(t => {
            return {
                title: `${t.title} [${t.planTitle}]`,
                start: t.deadline,
                color: t.status === 'Completed' ? '#2ec4b6' : (t.status === 'Pending' ? '#ffb703' : '#4361ee')
            };
        });

        const calendarEl = document.getElementById('calendar');
        if (!calendar) {
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek'
                },
                events: events,
                height: 600
            });
        } else {
            calendar.removeAllEvents();
            calendar.addEventSource(events);
        }
        calendar.render();
    }

    // ---- STUDY PLANS LOGIC ----
    async function loadStudyPlans() {
        const res = await fetch('/api/plans');
        currentPlans = await res.json();
        const container = document.getElementById('plans-container');
        container.innerHTML = '';
        if(currentPlans.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No plans yet. Create one!</p></div>';
        }
        currentPlans.forEach(plan => {
            const card = document.createElement('div');
            card.className = 'plan-card';
            card.innerHTML = `
                <div class="plan-title">${plan.title}</div>
                <div class="plan-date"><i class="fa-regular fa-calendar"></i> Created: ${plan.createdDate}</div>
                ${!plan.isOwner ? '<span style="font-size:0.8rem;color:var(--info);font-weight:600;"><i class="fa-solid fa-users"></i> Shared with you</span>' : ''}
                <div style="display:flex;gap:8px;margin-top:1rem;flex-wrap:wrap;">
                    ${plan.isOwner !== false ? `
                    <button class="btn btn-secondary btn-invite-plan" data-id="${plan.planID}" style="flex:1;justify-content:center;" title="Invite Collaborator">
                        <i class="fa-solid fa-user-plus"></i> Invite
                    </button>` : ''}
                    ${plan.isOwner !== false ? `
                    <button class="btn btn-danger btn-delete-plan" data-id="${plan.planID}" style="flex:1;justify-content:center;">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>` : ''}
                </div>
            `;
            const delBtn = card.querySelector('.btn-delete-plan');
            if(delBtn) delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm('Delete this plan and all its tasks?')) {
                    await fetch(`/api/plans/${plan.planID}`, {method:'DELETE'});
                    showToast('Plan deleted', 'info', 'fa-trash');
                    loadStudyPlans();
                }
            });
            const invBtn = card.querySelector('.btn-invite-plan');
            if(invBtn) invBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                showToast('Generating invite link...', 'info', 'fa-link');
                const r = await fetch(`/api/plans/${plan.planID}/invite`, {method:'POST'});
                const d = await r.json();
                document.getElementById('invite-link-input').value = d.link;
                document.getElementById('modal-invite').style.display = 'flex';
            });
            card.addEventListener('click', (e) => {
                if(e.target.closest('button')) return;
                document.querySelector('.nav-links li[data-view="tasks"]').click();
                document.getElementById('filter-plan').innerHTML = `<option value="${plan.planID}">${plan.title}</option>`;
                loadTasksView();
            });
            container.appendChild(card);
        });
        updatePlanDropdown();
    }
    
    function updatePlanDropdown() {
        const select = document.getElementById('filter-plan');
        select.innerHTML = '<option value="">Select a Study Plan...</option>';
        currentPlans.forEach(plan => {
            select.innerHTML += `<option value="${plan.planID}">${plan.title}</option>`;
        });
        select.addEventListener('change', loadTasksView);
    }

    // ---- TASKS LOGIC ----
    async function loadTasksView() {
        const planID = document.getElementById('filter-plan').value;
        const board = document.getElementById('tasks-board');
        const btnAdd = document.getElementById('btn-add-task');
        
        if(!planID) {
            board.style.display = 'none';
            btnAdd.style.display = 'none';
            return;
        }
        
        board.style.display = 'grid';
        btnAdd.style.display = 'inline-flex';
        
        const res = await fetch(`/api/plans/${planID}/tasks`);
        currentTasks = await res.json();
        currentTasks = sortTasks(currentTasks);
        
        // Listeners for advanced filters
        document.getElementById('search-task').addEventListener('input', renderAllColumns);
        document.getElementById('filter-priority').addEventListener('change', renderAllColumns);
        
        renderAllColumns();
        updateTimerDropdown();
    }

    function renderAllColumns() {
        renderTaskColumn('Pending', document.querySelector('[data-status="Pending"]'));
        renderTaskColumn('In Progress', document.querySelector('[data-status="In Progress"]'));
        renderTaskColumn('Completed', document.querySelector('[data-status="Completed"]'));
    }

    function sortTasks(tasks) {
        const priorityScore = { 'High': 3, 'Medium': 2, 'Low': 1 };
        return tasks.sort((a, b) => {
             if (priorityScore[a.priority] !== priorityScore[b.priority]) {
                return priorityScore[b.priority] - priorityScore[a.priority];
            }
            return new Date(a.deadline) - new Date(b.deadline);
        });
    }

    function renderTaskColumn(status, container) {
        container.innerHTML = '';
        
        // Apply Filters
        const searchQuery = document.getElementById('search-task').value.toLowerCase();
        const filterPri = document.getElementById('filter-priority').value;
        
        let tasks = currentTasks.filter(t => t.status === status);
        
        if (searchQuery) tasks = tasks.filter(t => t.title.toLowerCase().includes(searchQuery) || (t.tags && t.tags.toLowerCase().includes(searchQuery)));
        if (filterPri !== 'All') tasks = tasks.filter(t => t.priority === filterPri);
        
        if(tasks.length === 0) {
            let icon = status === 'Completed' ? 'fa-flag-checkered' : (status === 'Pending' ? 'fa-inbox' : 'fa-spinner');
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid ${icon}"></i>
                    <p>No tasks here</p>
                </div>
            `;
            return;
        }

        tasks.forEach(task => {
             const el = document.createElement('div');
            el.className = 'task-card';
            el.draggable = true;
            el.dataset.id = task.taskID;
            
            const risk = calculateRisk(task.status, task.deadline);
            
            // Format Tags
            let tagsHTML = '';
            if (task.tags && task.tags.trim() !== '') {
                const tagList = task.tags.split(',').map(t => `<span class="badge" style="background:#7209b7; margin-right:5px; font-size:10px;">${t.trim()}</span>`).join('');
                tagsHTML = `<div style="margin-top:5px;">${tagList}</div>`;
            }
            
            el.innerHTML = `
                <div class="task-header">
                    <h4>${task.title}</h4>
                    <span class="badge risk-${risk.class}">${risk.level}</span>
                </div>
                <div class="task-meta">
                    <span class="badge priority-${task.priority.toLowerCase()}">${task.priority}</span>
                    <span><i class="fa-regular fa-clock"></i> ${task.deadline}</span>
                </div>
                ${tagsHTML}
                <div class="task-progress-visual" title="${task.progress || 0}% Complete">
                    <div class="task-progress-fill" style="width: ${task.progress || 0}%"></div>
                </div>
            `;
            
            el.addEventListener('dragstart', handleDragStart);
            el.addEventListener('dragend', handleDragEnd);
            el.addEventListener('click', () => openTaskDetails(task, risk));
            container.appendChild(el);
        });
    }
    
    function openTaskDetails(task, risk) {
        document.getElementById('modal-task-details').style.display = 'flex';
        document.getElementById('detail-task-title').innerText = task.title;
        document.getElementById('detail-task-deadline').innerText = task.deadline;
        
        document.getElementById('detail-task-priority').innerText = task.priority;
        document.getElementById('detail-task-priority').className = `badge priority-${task.priority.toLowerCase()}`;
        
        document.getElementById('detail-task-status').innerText = task.status;
        document.getElementById('detail-task-status').className = `badge filter-badge`;
        
        document.getElementById('detail-task-risk').innerText = risk.level;
        document.getElementById('detail-task-risk').className = `badge risk-${risk.class}`;
        
        document.getElementById('detail-task-time').innerText = task.timeSpent || 0;
        
        if (task.tags) {
            document.getElementById('detail-task-tags').innerHTML = task.tags.split(',').map(t => `<span class="badge" style="background:#7209b7; margin-right:5px;">${t.trim()}</span>`).join('');
        } else {
            document.getElementById('detail-task-tags').innerHTML = "None";
        }
        
        document.getElementById('task-progress-slider').value = task.progress || 0;
        document.getElementById('task-progress-value').innerText = task.progress || 0;
        
        // Handle Quill Rich Text load
        if(task.notes) {
            quill.root.innerHTML = task.notes;
        } else {
            quill.root.innerHTML = "";
        }
        
        document.getElementById('btn-save-details').dataset.taskId = task.taskID;
        
        // Handle Subtasks Add btn
        const addSubBtn = document.getElementById('btn-add-subtask');
        // clone to remove old listeners
        const newAddSubBtn = addSubBtn.cloneNode(true);
        addSubBtn.parentNode.replaceChild(newAddSubBtn, addSubBtn);
        
        newAddSubBtn.addEventListener('click', async () => {
            const val = document.getElementById('new-subtask-title').value;
            if(!val) return;
            await fetch(`/api/tasks/${task.taskID}/subtasks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({title: val})
            });
            document.getElementById('new-subtask-title').value = '';
            // Refresh parent task
            await loadTasksView();
            const updatedTask = currentTasks.find(t => t.taskID === task.taskID);
            openTaskDetails(updatedTask, calculateRisk(updatedTask.status, updatedTask.deadline));
        });

        renderSubtasks(task.subtasks, task.taskID);

        // AI Breakdown Button — inject once, update onclick each open
        let aiBtn = document.getElementById('btn-ai-breakdown');
        if(!aiBtn) {
            aiBtn = document.createElement('button');
            aiBtn.id = 'btn-ai-breakdown';
            aiBtn.className = 'btn';
            aiBtn.style.cssText = 'width:100%;margin-top:12px;background:linear-gradient(135deg,#7209b7,#4361ee);color:white;justify-content:center;font-weight:700;';
            aiBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 🧠 AI: Auto-Generate Sub-Tasks';
            document.getElementById('subtasks-list').parentNode.appendChild(aiBtn);
        }
        aiBtn.onclick = () => runAIBreakdown(task.taskID, task.title);
    }
    
    function renderSubtasks(subtasks, parentTaskId) {
        const container = document.getElementById('subtasks-list');
        container.innerHTML = '';
        if(!subtasks || subtasks.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No sub-tasks added.</p>';
            return;
        }
        subtasks.forEach(st => {
            const di = document.createElement('div');
            di.style = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 5px; background: rgba(0,0,0,0.05); border-radius: 5px;";
            di.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" ${st.is_completed ? 'checked' : ''} style="width:18px;height:18px;margin:0;">
                    <span style="${st.is_completed ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${st.title}</span>
                </div>
                <i class="fa-solid fa-xmark" style="color:var(--danger); cursor:pointer;" title="Delete subtask"></i>
            `;
            
            // Toggle
            di.querySelector('input').addEventListener('change', async (e) => {
                const checked = e.target.checked;
                await fetch(`/api/subtasks/${st.subtaskID}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_completed: checked })
                });
                await loadTasksView();
                const updatedTask = currentTasks.find(t => t.taskID === parentTaskId);
                openTaskDetails(updatedTask, calculateRisk(updatedTask.status, updatedTask.deadline));
            });
            
            // Delete
            di.querySelector('.fa-xmark').addEventListener('click', async () => {
                await fetch(`/api/subtasks/${st.subtaskID}`, { method: 'DELETE' });
                await loadTasksView();
                const updatedTask = currentTasks.find(t => t.taskID === parentTaskId);
                openTaskDetails(updatedTask, calculateRisk(updatedTask.status, updatedTask.deadline));
            });
            
            container.appendChild(di);
        });
    }

    function calculateRisk(status, deadlineStr) {
        if (status === 'Completed') return { level: 'On Track', class: 'ontrack' };
        
        const deadline = new Date(deadlineStr);
        const today = new Date();
        const diffTime = deadline - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return { level: 'Critical', class: 'critical' };
        if (diffDays <= 3) return { level: 'High Risk', class: 'high' };
        if (status === 'In Progress' && diffDays > 3) return { level: 'Attention Needed', class: 'attention' };
        
        return { level: 'On Track', class: 'ontrack' };
    }

    // ---- DRAG AND DROP ----
    let draggedTask = null;
    function handleDragStart(e) {
        draggedTask = this;
        setTimeout(() => this.style.display = 'none', 0);
    }
    function handleDragEnd() {
        this.style.display = 'block';
        draggedTask = null;
    }
    function setupDragAndDrop() {
        document.querySelectorAll('.dropzone').forEach(zone => {
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', async e => {
                e.preventDefault(); zone.classList.remove('drag-over');
                if(!draggedTask) return;
                
                const taskId = draggedTask.dataset.id;
                const newStatus = zone.dataset.status;
                zone.appendChild(draggedTask);
                
                let progressUpdate = null;
                if(newStatus === 'Completed') {
                    progressUpdate = 100;
                    fireConfetti();
                    playSuccessDing();
                }
                const payload = { status: newStatus };
                if (progressUpdate !== null) payload.progress = progressUpdate;

                await fetch(`/api/tasks/${taskId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                loadTasksView();
            });
        });
    }

    // ---- TIMER & AUDIO LOGIC ----
    function updateTimerDropdown() {
        const select = document.getElementById('timer-task-dropdown');
        select.innerHTML = '<option value="">No task selected</option>';
        currentTasks.forEach(task => {
            if(task.status !== 'Completed') {
                select.innerHTML += `<option value="${task.taskID}">${task.title}</option>`;
            }
        });
    }
    
    function setupTimer() {
        document.getElementById('btn-timer-start').addEventListener('click', () => {
            if(!timerRunning) { timerRunning = true; timerInterval = setInterval(updateTimer, 1000); }
        });
        document.getElementById('btn-timer-pause').addEventListener('click', () => {
            timerRunning = false; clearInterval(timerInterval);
        });
        document.getElementById('btn-timer-reset').addEventListener('click', () => {
            timerRunning = false; clearInterval(timerInterval); timeLeft = 25 * 60; updateTimerDisplay();
        });
        
        document.getElementById('btn-zen-mode').addEventListener('click', () => {
            document.body.classList.toggle('zen-mode-active');
            const isZen = document.body.classList.contains('zen-mode-active');
            document.getElementById('btn-zen-mode').innerHTML = isZen ? '<i class="fa-solid fa-compress"></i> Exit Zen Mode' : '<i class="fa-solid fa-spa"></i> Toggle Zen Mode';
        });
    }
    
    function updateTimer() {
        if(timeLeft > 0) {
            timeLeft--; updateTimerDisplay();
        } else {
            clearInterval(timerInterval); timerRunning = false;
            const selectedTask = document.getElementById('timer-task-dropdown').value;
            if(selectedTask) {
                logTimerData(selectedTask, 25);
                showToast("Pomodoro completed! Time logged to task.", "success", "fa-clock");
                sendBrowserNotification("Pomodoro Complete!", "Great job focusing. Time logged. Take a 5-minute break!");
            } else {
                showToast("Pomodoro completed! Take a break.", "info", "fa-clock");
                sendBrowserNotification("Pomodoro Complete!", "Take a 5-minute break before your next session.");
            }
            fireConfetti();
            playSuccessDing();
            timeLeft = 25 * 60; updateTimerDisplay();
        }
    }
    function updateTimerDisplay() {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${m}:${s}`;
    }
    async function logTimerData(taskId, minutes) {
        await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSpent: minutes })
        });
    }

    function setupAudioPlayer() {
        const audioEl = document.getElementById('focus-audio-element');
        const selectEl = document.getElementById('focus-audio-select');
        const playBtn = document.getElementById('btn-audio-toggle');
        const volumeSlider = document.getElementById('audio-volume');
        let isPlaying = false;
        audioEl.volume = volumeSlider.value;
        volumeSlider.addEventListener('input', (e) => audioEl.volume = e.target.value);
        selectEl.addEventListener('change', () => {
            const trackUrl = selectEl.value;
            if(!trackUrl) {
                audioEl.pause(); isPlaying = false; playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; return;
            }
            audioEl.src = trackUrl;
            if (isPlaying) audioEl.play().catch(e => console.log(e));
        });
        playBtn.addEventListener('click', () => {
            if(!selectEl.value && !isPlaying) return showToast("Please choose a sound first!", "warning", "fa-music");
            if(isPlaying) {
                audioEl.pause(); isPlaying = false; playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            } else {
                audioEl.play().catch(e => console.log(e)); isPlaying = true; playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            }
        });
    }

    // ---- UI HELPERS ----
    function showToast(message, type = 'info', icon = 'fa-info-circle') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }
    
    function sendBrowserNotification(title, body) {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: body, icon: "https://cdn-icons-png.flaticon.com/512/813/813336.png" });
        }
    }
    
    function playSuccessDing() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0, ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch(e) { console.error('Audio api not supported', e); }
    }

    function fireConfetti() {
        if(typeof confetti !== 'undefined') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#4361ee', '#2ec4b6', '#ffb703', '#e63946'] });
        }
    }

    // ================================================================
    // FEATURE 1: AI TASK BREAKDOWN
    // ================================================================
    async function runAIBreakdown(taskId, taskTitle) {
        showToast('🧠 AI is analyzing your task...', 'info', 'fa-brain');
        const res = await fetch('/api/ai/breakdown', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({title: taskTitle})
        });
        const d = await res.json();
        if(d.subtasks) {
            for(const st of d.subtasks) {
                await fetch(`/api/tasks/${taskId}/subtasks`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({title: st.title})
                });
            }
            showToast(`✅ AI generated ${d.subtasks.length} smart sub-tasks!`, 'success', 'fa-wand-magic-sparkles');
            await loadTasksView();
            const updated = currentTasks.find(t => t.taskID === taskId);
            if(updated) openTaskDetails(updated, calculateRisk(updated.status, updated.deadline));
        }
    }

    // ================================================================
    // FEATURE 1: AI TASK BREAKDOWN (injected into openTaskDetails)
    // ================================================================
    async function runAIBreakdown(taskId, taskTitle) {
        showToast('🧠 AI is analyzing your task...', 'info', 'fa-brain');
        const res = await fetch('/api/ai/breakdown', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({title: taskTitle})
        });
        const d = await res.json();
        if(d.subtasks) {
            for(const st of d.subtasks) {
                await fetch(`/api/tasks/${taskId}/subtasks`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({title: st.title})
                });
            }
            showToast(`✅ AI generated ${d.subtasks.length} smart sub-tasks!`, 'success', 'fa-wand-magic-sparkles');
            await loadTasksView();
            const updated = currentTasks.find(t => t.taskID === taskId);
            if(updated) openTaskDetails(updated, calculateRisk(updated.status, updated.deadline));
        }
    }

    // ================================================================
    // FEATURE 2: COPY INVITE LINK
    // ================================================================
    document.getElementById('btn-copy-invite').addEventListener('click', () => {
        const link = document.getElementById('invite-link-input').value;
        navigator.clipboard.writeText(link).then(() => showToast('Link copied to clipboard!', 'success', 'fa-copy'));
    });

    // ================================================================
    // FEATURE 3: EMAIL REMINDERS
    // ================================================================
    function setupEmailReminder() {
        document.getElementById('form-email-settings').addEventListener('submit', async (e) => {
            e.preventDefault();
            const smtp_email = document.getElementById('smtp-email').value;
            const smtp_password = document.getElementById('smtp-password').value;
            const res = await fetch('/api/user/settings', {
                method:'PUT', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({email_reminders: true, smtp_email, smtp_password})
            });
            if(res.ok) showToast('Email settings saved!', 'success', 'fa-envelope');
        });
        document.getElementById('btn-send-reminders').addEventListener('click', async () => {
            showToast('Sending email...', 'info', 'fa-paper-plane');
            const res = await fetch('/api/reminders/send', {method:'POST'});
            const d = await res.json();
            if(res.ok) showToast(d.message || 'Email sent!', 'success', 'fa-envelope-circle-check');
            else showToast(d.error || 'Failed', 'error', 'fa-circle-xmark');
        });
    }

    // ================================================================
    // FEATURE 4: ONBOARDING TOUR (driver.js)
    // ================================================================
    function setupOnboarding() {
        if(!currentUser || currentUser.onboarding_done) return;
        const overlay = document.getElementById('onboarding-overlay');
        if(!overlay) return;
        overlay.style.display = 'flex';

        document.getElementById('btn-skip-tour').addEventListener('click', async () => {
            overlay.style.display = 'none';
            await fetch('/api/user/onboarding', {method:'POST'});
        });

        document.getElementById('btn-start-tour').addEventListener('click', async () => {
            overlay.style.display = 'none';
            await fetch('/api/user/onboarding', {method:'POST'});
            setTimeout(() => {
                if(typeof window.driver !== 'undefined') {
                    const drvr = new window.driver.js.Driver({
                        animate: true, showProgress: true,
                        steps: [
                            { element: '#dashboard', popover: { title: '📊 Dashboard', description: 'Your study command center with real-time stats.' } },
                            { element: '[data-view="study-plans"]', popover: { title: '📁 Study Plans', description: 'Create plans for each subject or project.' } },
                            { element: '[data-view="tasks"]', popover: { title: '✅ Kanban Tasks', description: 'Drag & drop tasks between Pending, In Progress, and Completed.' } },
                            { element: '[data-view="timer"]', popover: { title: '⏱️ Focus Timer', description: 'Pomodoro timer with ambient music and Zen Mode.' } },
                            { element: '[data-view="settings"]', popover: { title: '⚙️ Settings', description: 'Update your profile and configure email deadline reminders.' } },
                        ]
                    });
                    drvr.drive();
                }
            }, 300);
        });
    }

});
