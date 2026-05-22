# TaskPulse: Advanced Study Planner & Productivity Ecosystem
**Project Report**

## 1. Abstract
**TaskPulse** is a comprehensive, modern web-based productivity and study management platform designed to help students and professionals organize their workflow. Moving beyond standard to-do lists, TaskPulse integrates advanced features such as an AI-powered task breakdown engine, real-time study plan collaboration, a Pomodoro focus timer with ambient audio, automated deadline email reminders, and a fully featured Administrator Dashboard. The application boasts a premium "glassmorphism" user interface with dynamic canvas-based background animations to provide an immersive user experience.

---

## 2. Technology Stack
The project was built using a robust, lightweight, and scalable technology stack:

### Backend (Server & Logic)
*   **Python 3.x:** The core backend programming language.
*   **Flask:** A lightweight WSGI web application framework used to handle routing, API endpoints, and template rendering.
*   **Flask-SQLAlchemy:** An ORM (Object-Relational Mapper) used to interact with the database using Python objects instead of raw SQL.
*   **Flask-Login:** Used for secure user session management, authentication, and route protection.
*   **Werkzeug:** Used for cryptographic password hashing (bcrypt) to ensure user security.
*   **smtplib:** Standard Python library used to send automated email alerts via an SMTP server.

### Frontend (User Interface)
*   **HTML5 & CSS3:** Semantic markup and advanced styling, featuring CSS Grid, Flexbox, custom animations, and glassmorphism.
*   **Vanilla JavaScript (ES6+):** Handles all asynchronous API calls (`fetch`), DOM manipulation, and dynamic state management without heavy front-end frameworks.
*   **HTML5 Canvas API:** Used to create the dynamic, interactive "Neural Particle Network" background engine.
*   **Chart.js:** Used for rendering real-time, interactive data visualization (Doughnut charts) on the dashboard.
*   **Quill.js:** A rich text editor integrated for taking detailed notes within tasks.
*   **FullCalendar.js:** Used to provide a monthly and weekly visual calendar view of upcoming task deadlines.
*   **Driver.js:** Used to power the interactive, step-by-step onboarding tour for new users.
*   **FontAwesome:** Used for scalable vector icons throughout the UI.

### Database
*   **SQLite3:** A C-language library that implements a small, fast, self-contained, high-reliability, full-featured, SQL database engine.

---

## 3. Core Features & Capabilities

### 1. Smart Task & Plan Management
*   **Study Plans:** Users can group tasks into specific subjects or projects.
*   **Kanban Board:** A drag-and-drop interface allowing users to move tasks between "Pending", "In Progress", and "Completed" states.
*   **Risk Assessment:** The system automatically calculates task risk based on impending deadlines (On Track, Attention Needed, High Risk, Critical).

### 2. AI Task Breakdown Engine
*   Instead of feeling overwhelmed by large tasks, users can click the "AI: Auto-Generate Sub-Tasks" button.
*   The backend processes the task title and algorithmically generates a logical, step-by-step sub-task checklist to guide the user.

### 3. Real-Time Collaboration
*   Users can generate a secure, 24-hour expiration invite link for any of their Study Plans.
*   When a peer opens the link, they are automatically added as a collaborator ("Editor"), allowing multiple users to view and manage the same project board.

### 4. Focus Timer & Zen Mode
*   A built-in Pomodoro timer (25-minute intervals) helps users maintain focus.
*   **Zen Mode:** Expands the timer to full-screen, hiding distractions.
*   **Ambient Audio:** Users can select lo-fi or nature sounds to play while the timer runs. Time spent is automatically logged to the selected task upon completion.

### 5. Automated Email Reminders
*   Users can configure their Gmail SMTP settings within the app.
*   The system scans for "High Risk" or "Critical" tasks and dispatches automated email alerts to prevent missed deadlines.

### 6. Interactive Onboarding Tour
*   New users are greeted with a smooth, step-by-step guided tour powered by Driver.js, explaining the dashboard, Kanban board, and timer features.

### 7. Global Admin Dashboard
*   A protected route (`/admin`) restricted to system administrators.
*   **System Overview:** Displays global statistics (Total Users, Plans, Tasks, Time Logged).
*   **User Management:** Admins can view all registered users, their roles, and securely delete users and all their associated data from the database.

---

## 4. Database Architecture (Entity-Relationship)

The SQLite database consists of **7 Relational Tables**:

1.  **User:** Stores user credentials, hashed passwords, onboarding state, and optional SMTP settings.
2.  **StudyPlan:** Represents a project/subject. Linked to a User (Owner).
3.  **PlanCollaborator:** A mapping table linking Users to StudyPlans they have been invited to (Many-to-Many).
4.  **InviteToken:** Stores temporary cryptographic tokens used for sharing Study Plans.
5.  **Task:** Belongs to a StudyPlan. Stores title, deadline, priority, status, tags, and rich-text notes.
6.  **SubTask:** Belongs to a Task. Represents the AI-generated or manually added checklist items.
7.  **ProgressTracker:** Belongs to a Task. Logs the integer percentage of completion and the total minutes spent via the Pomodoro timer.

---

## 5. Security & Best Practices Implemented
*   **Password Hashing:** Passwords are never stored in plaintext; they are hashed using `generate_password_hash`.
*   **Session Management:** `Flask-Login` prevents unauthorized access to API endpoints.
*   **Role-Based Access Control (RBAC):** The `@admin_required` decorator ensures standard users cannot access or execute Admin-level API routes.
*   **RESTful API Design:** The backend communicates via clean JSON responses and standard HTTP methods (GET, POST, PUT, DELETE).
*   **Responsive Design:** The UI utilizes flexible CSS grids and media queries to ensure functionality on desktops, tablets, and mobile devices.

---

## 6. Conclusion
TaskPulse successfully merges front-end aesthetic design with robust back-end engineering. By integrating features that target both productivity (collaboration, task management) and psychological focus (Pomodoro, Zen mode, AI breakdown), the application serves as a complete ecosystem for student and professional success.
