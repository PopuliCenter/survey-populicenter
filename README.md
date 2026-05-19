# Aplikasi Survei Web Base Populi Center

Platform survei berbasis web full-stack untuk pengumpulan data lapangan terstruktur.

## Stack Teknologi

- **Backend**: Node.js + Express + Sequelize + PostgreSQL
- **Frontend**: React + Vite + Tailwind CSS
- **Testing**: Jest (backend) + fast-check (property-based testing)
- **Job Queue**: Bull + Redis
- **Database**: PostgreSQL

## Struktur Proyek

```
.
├── backend/              # Backend API (Node.js + Express)
│   ├── src/
│   │   ├── app.js       # Express app entry point
│   │   ├── config/      # Database configuration
│   │   ├── models/      # Sequelize models
│   │   ├── migrations/  # Database migrations
│   │   └── seeders/     # Database seeds
│   ├── package.json
│   └── .env.example
│
├── frontend/            # Frontend (React + Vite)
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/       # Admin dashboard pages
│   │   ├── components/  # Shared components
│   │   ├── services/    # API client
│   │   └── surveyor/    # Surveyor interface
│   ├── package.json
│   └── vite.config.js
│
├── requirements.md      # Requirements document
├── design.md           # Design document
└── tasks.md            # Implementation tasks
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run migrate
npm run seed
npm start
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Default Admin Account

After running the seed:

- Email: `admin@example.com`
- Password: `Admin123!`

## Database Schema

The platform uses the following tables:

- `users` - Admin and surveyor accounts
- `surveys` - Survey definitions
- `questions` - Survey questions with skip logic
- `surveyor_quotas` - Quota assignments per surveyor
- `responses` - Survey responses
- `answers` - Individual question answers
- `audit_logs` - Activity audit trail
- `export_jobs` - Async export job tracking

## Development

- Backend runs on port 3000
- Frontend runs on port 5173
- API proxy configured in Vite for `/api` routes

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## License

Proprietary
