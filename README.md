# </> Portfolio (Node.js + Express + MySQL)

A full-stack developer portfolio with a glow-themed public site and a private admin panel. All content is edited from the admin panel and stored in MySQL. It runs locally and can also be hosted on Vercel or Netlify.

---

## 1. Features

**Public site**
- `</> Portfolio` navbar, hero section with your photo, name, title and bio
- LeetCode progress split into Easy, Medium and Hard with progress bars
- Projects grid: click a project to see details, technologies, the GitHub repository link and the live demo link
- Certificates (images or PDF)
- Feedback wall (only approved feedback is shown) and a feedback form
- **Download Resume** button (hero and footer) that downloads your PDF
- Contact form
- Professional footer with quick links, GitHub, LinkedIn, email and back to top
- Responsive layout for phones, iPad and tablets, laptops and desktops (scrolling menu on phones, touch-friendly buttons, safe-area support for iPhone)
- Updates automatically every 8 seconds when you change something in the admin panel

**Admin panel** (`/admin.html`)
- Login with a hashed password (bcrypt) and a 12-hour session token (JWT)
- Dashboard: profile photo upload and removal, counts, LeetCode username and refresh
- Profile: name, title, about, email, location, GitHub and LinkedIn links, photo
- Theme: two glow colors, background color, text color, font (16 Google Fonts), glow strength, with live preview
- Projects: add, edit, delete, screenshot upload, GitHub and live links
- Certificates: upload images or PDFs, delete
- Resume: upload or remove your PDF (Profile tab)
- Dashboard quick actions: Add project, Add certificate
- **Analytics tab (private)**: visits, unique visitors, visits today, project opens, resume downloads, choose any date range (or 7 days, 3 months, 12 months, this month); see visitors by Day, Month or Weekday as a Line, Bar or Pie chart; pie charts for devices (mobile, tablet, desktop) and where visitors come from; top projects and recent activity. It is visible only after admin login. It is not on the Dashboard tab and never on the public site
- Messages: read, mark unread, delete, with an unread badge and a pop-up for new messages
- Feedback: approve, hide, delete
- Account: change admin username and password

---

## 2. Tech stack

| Part | Technology |
|---|---|
| Backend | Node.js 18 or newer, Express 4 |
| Database | MySQL (via `mysql2`) |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Uploads | `multer` (memory), files stored in MySQL |
| Hosting adapters | `serverless-http` for Netlify, `api/index.js` for Vercel |
| Frontend | Plain HTML, CSS and JavaScript (no build step) |

---

## 3. Folder structure

```
portfolio/
├── server.js                  Express app, MySQL layer, all API routes
├── package.json               Dependencies
├── .env.example               Settings template (copy to .env)
├── vercel.json                Vercel routing
├── netlify.toml               Netlify routing and build settings
├── api/
│   └── index.js               Vercel serverless entry
├── netlify/functions/
│   └── server.js              Netlify function entry
└── public/
    ├── index.html             Public portfolio page
    ├── admin.html             Admin panel
    ├── common.js              Shared theme and live-refresh code
    └── style.css              Shared styles (glow, buttons, inputs)
```

---

## 4. Run it on your computer (Windows)

### Step 1: Install requirements
1. **Node.js 18 or newer**: https://nodejs.org (check with `node -v`)
2. **MySQL**: install MySQL Community Server or XAMPP, and make sure the MySQL service is running.

### Step 2: Create the settings file
In the `portfolio` folder, copy `.env.example` and name the copy `.env`. Edit these lines:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=portfolio
```

Leave `DATABASE_URL` commented out (with `#`) for local use.

### Step 3: Install and start
```
npm install
npm start
```

You should see:

```
Portfolio:   http://localhost:3000
Admin panel: http://localhost:3000/admin.html
MySQL: connected and tables are ready
```

The database and all tables are created automatically on the first start. If the database user is not allowed to create databases, create an empty database named `portfolio` yourself first.

### Step 4: Open the site
- Portfolio: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html

Always open the pages through `localhost:3000`. Do not double-click the HTML files.

### Default login
| Username | Password |
|---|---|
| `admin` | `admin123` |

Change the username and password right away in **Admin > Account**. You can also set `ADMIN_USER` and `ADMIN_PASS` in `.env` before the first start.

---

## 5. Environment variables

| Variable | Meaning | Default |
|---|---|---|
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | empty |
| `DB_NAME` | Database name | `portfolio` |
| `DATABASE_URL` | Full connection string, used for cloud MySQL. Overrides the `DB_*` values. Format: `mysql://USER:PASSWORD@HOST:3306/DATABASE_NAME` | not set |
| `DB_SSL` | `false`, `true` (verify certificate) or `insecure` (encrypt, skip certificate check) | `false` |
| `DB_SSL_CA` | Optional CA certificate text, for providers like Aiven. Use `\n` for line breaks | not set |
| `ADMIN_USER` | Admin username created on first start | `admin` |
| `ADMIN_PASS` | Admin password created on first start | `admin123` |
| `PORT` | Local server port | `3000` |

---

## 6. Using the admin panel

1. **Dashboard**: upload your profile photo, then enter your LeetCode username and click **Save and fetch**. Counts refresh automatically every 10 minutes. If LeetCode cannot be reached, open **Enter counts manually** and type your numbers.
2. **Profile**: fill in your name, title, about text, contact details and GitHub and LinkedIn URLs, then **Save profile**.
3. **Theme**: pick colors, font and glow strength. The page previews changes instantly. Click **Save theme** to publish.
4. **Projects**: fill in the title, description, technologies (comma separated), GitHub repository URL, live demo URL and a screenshot. Links must start with `http://` or `https://`.
5. **Certificates**: add a title, issuer, date and an image or PDF.
6. **Messages**: messages sent from the contact form appear here live.
7. **Feedback**: new feedback is hidden until you click **Approve**.

**Upload rules:** PNG, JPG, GIF, WEBP and PDF only, up to 4 MB per file.

---

## 7. Database

Tables are created automatically.

| Table | Stores |
|---|---|
| `kv` | Admin login (hashed), token secret, theme settings, profile, LeetCode data |
| `projects` | Title, description, technologies, GitHub link, live link, image |
| `certificates` | Title, issuer, date, file, PDF flag |
| `messages` | Contact messages with read status |
| `feedback` | Feedback with rating and approval status |
| `files` | Uploaded photos, screenshots, certificates and the resume PDF (binary) |
| `visits` | Visitor analytics events (visit, project open, resume download) |

Because files live in MySQL, a single database backup contains everything. Back it up with:

```
mysqldump -u root -p portfolio > backup.sql
```

---

## 8. API reference

**Public**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/public` | All public portfolio data |
| GET | `/api/health` | Database connection status |
| GET | `/uploads/:id` | Serve an uploaded file |
| GET | `/api/resume` | Download the resume PDF (counted in analytics) |
| POST | `/api/track` | Record a visit or project open (used by the site) |
| POST | `/api/login` | Admin login, returns a token |
| POST | `/api/messages` | Send a contact message |
| POST | `/api/feedback` | Submit feedback for approval |

**Admin** (send header `Authorization: Bearer <token>`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/all` | Everything, including messages and pending feedback |
| PUT | `/api/admin/profile` | Update profile and photo |
| DELETE | `/api/admin/photo` | Remove profile photo |
| PUT | `/api/admin/settings` | Update theme |
| PUT | `/api/admin/password` | Change admin username and/or password |
| PUT, DELETE | `/api/admin/resume` | Upload or remove the resume PDF |
| GET | `/api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=SECONDS` | Visitor analytics by day, month and weekday (admin only) |
| POST, PUT, DELETE | `/api/admin/projects` and `/:id` | Manage projects |
| POST, DELETE | `/api/admin/certificates` and `/:id` | Manage certificates |
| PUT | `/api/admin/leetcode` | Save username or manual counts |
| POST | `/api/admin/leetcode/refresh` | Fetch LeetCode now |
| PATCH, DELETE | `/api/admin/messages/:id` | Mark read, delete |
| PATCH, DELETE | `/api/admin/feedback/:id` | Approve or hide, delete |

---

## 9. Deploy to Vercel or Netlify

Vercel and Netlify cannot run MySQL and cannot keep files on disk. So you need a **cloud MySQL database** (for example Aiven, TiDB Cloud or Railway). Uploaded files are already stored in MySQL, so nothing else is needed.

### Before deploying
1. Create a cloud MySQL database and copy its connection string:
   `mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME`
2. Push the `portfolio` folder to a GitHub repository. Do not push your `.env` file.

### Vercel
1. Import the repository in Vercel. Leave the build command empty.
2. Add environment variables: `DATABASE_URL`, `DB_SSL=true` (if your provider needs SSL), and optionally `ADMIN_USER` and `ADMIN_PASS`.
3. Deploy. Open `https://your-site.vercel.app` and `https://your-site.vercel.app/admin.html`.

### Vercel checklist (if the backend does not work)
1. **Open `https://your-site.vercel.app/api/health`.** If it shows `{"ok":true,...}` the backend and database work. If it shows an error, the message tells you what to fix.
2. **Root Directory:** if your GitHub repository has the project inside a folder (for example `placement_code/portfolio`), open Vercel > Project Settings > General > Root Directory and set it to that folder. Redeploy.
3. **Environment variables** (Settings > Environment Variables): add `DATABASE_URL` from a cloud MySQL (not `localhost`). Add `DB_SSL=true` if the provider needs SSL. After adding or changing variables, you must **Redeploy**.
4. **Free cloud MySQL options:** TiDB Cloud or Aiven. Copy the connection string and write it as `mysql://USER:PASSWORD@HOST:PORT/DATABASE`. If the password has special characters like `@` or `#`, URL-encode them (`@` becomes `%40`).
5. **Allow connections:** in your database provider, allow access from anywhere (0.0.0.0/0), because Vercel uses changing IP addresses.
6. **Logs:** Vercel > your project > Logs shows the exact server error.

### Netlify
1. Add a new site from the repository. The settings come from `netlify.toml` (publish folder `public`, functions folder `netlify/functions`).
2. Add the same environment variables in Site settings.
3. Deploy and open the site and `/admin.html`.

### Differences when hosted
- Live updates use a refresh every 8 seconds.
- LeetCode counts refresh when someone opens the site and the saved data is older than 10 minutes.
- Upload limit is 4 MB per file, which fits the serverless request limits.

---

## 10. Troubleshooting

| Message | Meaning and fix |
|---|---|
| `MySQL is not running ... [ECONNREFUSED]` | MySQL service is off. Start it (Windows Services, or the XAMPP control panel), then restart `npm start`. |
| `MySQL username or password in .env is wrong [ER_ACCESS_DENIED_ERROR]` | Fix `DB_USER` and `DB_PASSWORD` in `.env`. |
| `database name in .env does not exist [ER_BAD_DB_ERROR]` | Create an empty database with the name in `DB_NAME`. |
| `MySQL host name in .env was not found [ENOTFOUND]` | `DB_HOST` or `DATABASE_URL` is wrong. For local use keep `DATABASE_URL` commented out. |
| `/api/health` says `NO_DATABASE_URL` | The variable is missing on Vercel or Netlify. Add `DATABASE_URL` and redeploy. |
| `/api/health` says certificate not trusted | Set `DB_SSL=insecure`, or add the provider CA in `DB_SSL_CA`. |
| Site shows a yellow bar: backend not connected | Open `/api/health` on your site to see the reason. |
| Photo or file upload fails | Check the terminal shows `MySQL: connected`. File must be an image or PDF under 4 MB. |
| Admin page opens but login fails | Read the yellow message under the login box. It shows the database problem. |
| Page does not load or looks empty | You opened the HTML file directly. Use http://localhost:3000. |
| Resume button missing | Upload a PDF in Profile > Resume. Only real PDF files up to 4 MB are accepted. |
| Analytics shows zero | Open your public site in a normal browser window (bots are ignored). Your own admin page visits are not counted. |
| LeetCode shows an error | Check the username. If LeetCode is blocked on your network, enter counts manually. |
| Changed `.env` but nothing changed | Stop the server with Ctrl+C and run `npm start` again. |

---

## 11. Security notes

- Change the default admin password before sharing the site.
- Never commit or share your `.env` file.
- Passwords are hashed with bcrypt. Admin routes require a valid token.
- All user text is escaped before it is shown on the page.
- Analytics are privacy-friendly: no IP addresses are stored. A random id saved in the visitor's browser counts unique visitors. Search-engine bots are ignored, and events older than 400 days are deleted automatically.
- Contact and feedback forms allow 5 submissions per minute per visitor, and login allows 10 attempts per minute. These counters are kept in server memory, so on Vercel and Netlify they apply per server instance.

---

## 12. Known limits

- Built for a personal portfolio, not for heavy traffic.
- LeetCode data comes from LeetCode's public GraphQL endpoint, which can change or block requests.
- The local version and its MySQL features were tested end to end. The Vercel and Netlify entry points were tested locally against MySQL, but not on live Vercel or Netlify servers, so check the first deployment and its environment variables.
