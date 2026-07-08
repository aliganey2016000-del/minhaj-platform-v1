# 🕌 Masjid Al-Rahma (مسجد الرحمة) — Islamic Educational Management Platform
## Complete Architecture & Design Document

**Version:** 1.0.0  
**Date:** 8 July 2026  
**Architect:** Senior Full Stack Software Architect  
**Status:** Pre-Development — Planning Phase

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete Project Architecture](#2-complete-project-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Database Design & Collections](#4-database-design--collections)
5. [Complete API List](#5-complete-api-list)
6. [User Flow Diagrams](#6-user-flow-diagrams)
7. [ER Diagram (Text)](#7-er-diagram-text)
8. [Feature List](#8-feature-list)
9. [Development Roadmap](#9-development-roadmap)
10. [Folder Naming Convention](#10-folder-naming-convention)
11. [Coding Standards](#11-coding-standards)
12. [Deployment Strategy](#12-deployment-strategy)
13. [Security Architecture](#13-security-architecture)
14. [i18n Strategy](#14-i18n-strategy)
15. [Performance Optimizations](#15-performance-optimizations)

---

## 1. Project Overview

### 1.1 Mission Statement
A comprehensive, scalable, and secure Islamic Educational Management Platform designed for **Masjid Al-Rahma (مسجد الرحمة)** to manage students, teachers, parents, courses, exams, finances, and community engagement — all within a beautiful, modern Islamic-themed interface.

### 1.2 Core Principles
- **Tawakkul (Trust in Allah):** Built with sincerity and excellence (Ihsan)
- **Modularity:** Each feature is self-contained and independently deployable
- **Scalability:** Designed to handle 100,000+ users from day one
- **Security First:** Zero-trust architecture; every request is authenticated and authorized
- **Accessibility:** WCAG 2.1 AA compliant; RTL support for Arabic
- **Performance:** Lighthouse scores ≥ 95 across all metrics
- **i18n Ready:** Somali, Arabic, English from the ground up

### 1.3 Tech Stack Summary

| Layer | Technology | Justification |
|---|---|---|
| **Frontend Framework** | React 18 + Vite | Fast DX, optimal build times, ESM-native |
| **Styling** | TailwindCSS 3.4 + Shadcn UI | Utility-first, highly customizable, beautiful defaults |
| **Animation** | Framer Motion 11 | Declarative, performant, gesture-ready |
| **Routing** | React Router 6 | Nested layouts, loaders, actions |
| **HTTP Client** | Axios + React Query (TanStack) | Caching, retry, optimistic updates |
| **Forms** | React Hook Form + Zod | Type-safe, performant, schema-validated |
| **Backend Runtime** | Node.js 22 LTS | Stable, widely supported, great ecosystem |
| **Backend Framework** | Express.js 4 | Mature, minimal, middleware-rich |
| **Database** | MongoDB 7 + Mongoose 8 | Flexible schema, great for educational data |
| **Authentication** | JWT (access + refresh tokens) + bcrypt | Stateless, scalable, secure |
| **Email** | Nodemailer + Handlebars templates | Transactional emails, password resets |
| **Security** | Helmet, CORS, express-rate-limit, express-mongo-sanitize, xss-clean | Defense in depth |
| **Validation** | Joi (backend) + Zod (frontend) | Dual-layer validation |
| **Logging** | Winston + Morgan | Structured logging, request tracing |
| **File Upload** | Multer + Sharp | Image optimization, secure uploads |
| **Background Jobs** | Bull + Redis | Email queues, report generation |
| **Testing** | Jest + Supertest + React Testing Library | Unit, integration, E2E |
| **i18n** | react-i18next + i18next-http-backend | Lazy-loaded translations |
| **Monorepo** | Turborepo | Shared configs, types, utilities |

---

## 2. Complete Project Architecture

### 2.1 High-Level Architecture Diagram (Text)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│                                                                               │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│   │  Public  │   │  Admin   │   │ Student  │   │  Parent  │                │
│   │ Website  │   │  Portal  │   │  Portal  │   │  Portal  │                │
│   │ (Landing)│   │ (React)  │   │ (React)  │   │ (React)  │                │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘                │
│        │              │              │              │                        │
│        └──────────────┴──────────────┴──────────────┘                        │
│                          │                                                    │
│                    React Router (Role-Based Routing)                          │
│                          │                                                    │
│                 Axios Instance (Interceptors)                                 │
│                  ┌───────┴───────┐                                            │
│                  │  Access Token │  Refresh Token                             │
│                  │  (15 min TTL) │  (7 day TTL)                              │
│                  └───────────────┘                                            │
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │ HTTPS (TLS 1.3)
                          │
┌─────────────────────────▼────────────────────────────────────────────────────┐
│                              CDN / EDGE LAYER                                 │
│                                                                               │
│   ┌──────────────────────────────────────────────────────────────────┐       │
│   │                        Vercel Edge Network                         │       │
│   │  • Static Asset Caching (immutable URLs)                           │       │
│   │  • Image Optimization (next/image equivalent)                      │       │
│   │  • DDoS Protection                                                │       │
│   │  • Global CDN (300+ PoPs)                                         │       │
│   └──────────────────────────────────────────────────────────────────┘       │
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                    │
│                                                                               │
│   ┌──────────────────────────────────────────────────────────────────┐       │
│   │                    Hostinger VPS (Coolify)                         │       │
│   │                                                                   │       │
│   │   ┌──────────────────────────────────────────────────────────┐   │       │
│   │   │                   Nginx Reverse Proxy                      │   │       │
│   │   │  • SSL Termination (Let's Encrypt)                         │   │       │
│   │   │  • Gzip/Brotli Compression                                 │   │       │
│   │   │  • Rate Limiting (IP-based)                                │   │       │
│   │   │  • Request Size Limiting (10MB)                            │   │       │
│   │   └──────────────────────┬───────────────────────────────────┘   │       │
│   │                          │                                        │       │
│   │   ┌──────────────────────▼───────────────────────────────────┐   │       │
│   │   │               Express.js API Server (Cluster Mode)         │   │       │
│   │   │                                                           │   │       │
│   │   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │       │
│   │   │   │   Auth   │  │  Course  │  │  Student │  │   Exam   │ │   │       │
│   │   │   │  Module  │  │  Module  │  │  Module  │  │  Module  │ │   │       │
│   │   │   └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │       │
│   │   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │       │
│   │   │   │ Payment  │  │   News   │  │   Event  │  │  Gallery │ │   │       │
│   │   │   │  Module  │  │  Module  │  │  Module  │  │  Module  │ │   │       │
│   │   │   └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │       │
│   │   │                                                           │   │       │
│   │   │   ┌──────────────────────────────────────────────────┐    │   │       │
│   │   │   │              Middleware Pipeline                   │    │   │       │
│   │   │   │  Helmet → CORS → RateLimit → Sanitize → Auth →   │    │   │       │
│   │   │   │  Validate → Controller → Service → Repository     │    │   │       │
│   │   │   └──────────────────────────────────────────────────┘    │   │       │
│   │   └──────────────────────────────────────────────────────────┘   │       │
│   │                                                                   │       │
│   │   ┌──────────────────────────────────────────────────────────┐   │       │
│   │   │                    Bull Queue Worker                       │   │       │
│   │   │  • Email Sending (Nodemailer)                              │   │       │
│   │   │  • Report Generation (PDF)                                 │   │       │
│   │   │  • Certificate Generation                                  │   │       │
│   │   │  • Notification Dispatch                                   │   │       │
│   │   └──────────────────────────────────────────────────────────┘   │       │
│   └──────────────────────────────────────────────────────────────────┘       │
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────────────────┐
│                              DATA LAYER                                        │
│                                                                               │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│   │   MongoDB 7     │   │    Redis 7       │   │   File Storage  │            │
│   │   (Primary DB)  │   │   (Cache/Queue)  │   │   (Local/S3)    │            │
│   │                 │   │                  │   │                  │            │
│   │ • Replica Set   │   │ • Session Store  │   │ • User Avatars   │            │
│   │ • Atlas Cloud   │   │ • Rate Limiting  │   │ • Certificates   │            │
│   │ • Automated     │   │ • Bull Queue     │   │ • Gallery Images │            │
│   │   Backups       │   │ • Cache Layer    │   │ • Course Media   │            │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 MVC Architecture (Backend)

```
Request → Router → Middleware Chain → Controller → Service → Repository → Model → MongoDB
                                                      ↓
                                                 Response ←── JSON
```

**Layer Responsibilities:**

| Layer | Responsibility | Example |
|---|---|---|
| **Router** | Route definitions, HTTP method binding | `router.get('/courses', courseController.getAll)` |
| **Middleware** | Auth, validation, sanitization, logging | `authMiddleware, validate(courseSchema), sanitize` |
| **Controller** | Request/Response handling, HTTP concerns | Parse params, send response, set status codes |
| **Service** | Business logic, orchestration | Calculate GPA, enroll student, process payment |
| **Repository** | Data access abstraction | `findById`, `findWithPagination`, `aggregate` |
| **Model** | Schema definition, validation, indexes | Mongoose Schema + Model |
| **DTO** | Data Transfer Objects for validation | Joi/Zod schemas |

### 2.3 Frontend Architecture (Component Tree)

```
App
├── ThemeProvider (Dark/Light Mode)
├── I18nProvider (react-i18next)
├── QueryClientProvider (TanStack Query)
├── AuthProvider (Context API)
│   ├── PublicLayout
│   │   ├── Navbar
│   │   ├── Hero
│   │   ├── About
│   │   ├── Programs
│   │   ├── Courses
│   │   ├── Teachers
│   │   ├── Achievements
│   │   ├── Events
│   │   ├── News
│   │   ├── Gallery
│   │   ├── Testimonials
│   │   ├── Donation
│   │   ├── Contact
│   │   ├── GoogleMap
│   │   └── Footer
│   ├── AdminLayout
│   │   ├── AdminSidebar
│   │   ├── AdminHeader
│   │   └── AdminOutlet (React Router)
│   ├── StudentLayout
│   │   ├── StudentSidebar
│   │   ├── StudentHeader
│   │   └── StudentOutlet
│   └── ParentLayout
│       ├── ParentSidebar
│       ├── ParentHeader
│       └── ParentOutlet
├── SharedComponents
│   ├── Button
│   ├── Input
│   ├── Modal
│   ├── Table
│   ├── Card
│   ├── Badge
│   ├── Avatar
│   ├── Breadcrumb
│   ├── Pagination
│   ├── SearchInput
│   ├── FileUpload
│   ├── RichTextEditor
│   ├── DataTable
│   ├── StatCard
│   ├── Chart (Recharts)
│   ├── Calendar
│   ├── Toast
│   ├── ConfirmDialog
│   └── EmptyState
└── Hooks
    ├── useAuth
    ├── useDebounce
    ├── usePagination
    ├── useMediaQuery
    ├── useLocalStorage
    ├── useClickOutside
    └── useIntersectionObserver
```

---

## 3. Folder Structure

### 3.1 Monorepo Structure

```
masjid-al-rahma-platform/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Continuous Integration
│   │   ├── deploy-frontend.yml       # Vercel deployment
│   │   └── deploy-backend.yml        # Coolify deployment
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── frontend/                     # React + Vite Frontend
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   ├── logo.svg
│   │   │   ├── og-image.png
│   │   │   └── manifest.json
│   │   ├── src/
│   │   │   ├── assets/
│   │   │   │   ├── images/
│   │   │   │   │   ├── hero/
│   │   │   │   │   ├── mosque/
│   │   │   │   │   ├── patterns/
│   │   │   │   │   └── icons/
│   │   │   │   ├── fonts/
│   │   │   │   │   ├── arabic/
│   │   │   │   │   └── latin/
│   │   │   │   └── styles/
│   │   │   │       ├── globals.css
│   │   │   │       ├── theme.css
│   │   │   │       └── animations.css
│   │   │   ├── components/
│   │   │   │   ├── ui/               # Shadcn UI primitives
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── select.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   │   ├── table.tsx
│   │   │   │   │   ├── card.tsx
│   │   │   │   │   ├── badge.tsx
│   │   │   │   │   ├── avatar.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── accordion.tsx
│   │   │   │   │   ├── alert-dialog.tsx
│   │   │   │   │   ├── breadcrumb.tsx
│   │   │   │   │   ├── calendar.tsx
│   │   │   │   │   ├── chart.tsx
│   │   │   │   │   ├── checkbox.tsx
│   │   │   │   │   ├── command.tsx
│   │   │   │   │   ├── data-table.tsx
│   │   │   │   │   ├── date-picker.tsx
│   │   │   │   │   ├── form.tsx
│   │   │   │   │   ├── label.tsx
│   │   │   │   │   ├── popover.tsx
│   │   │   │   │   ├── progress.tsx
│   │   │   │   │   ├── radio-group.tsx
│   │   │   │   │   ├── scroll-area.tsx
│   │   │   │   │   ├── separator.tsx
│   │   │   │   │   ├── sheet.tsx
│   │   │   │   │   ├── skeleton.tsx
│   │   │   │   │   ├── slider.tsx
│   │   │   │   │   ├── switch.tsx
│   │   │   │   │   ├── textarea.tsx
│   │   │   │   │   ├── toast.tsx
│   │   │   │   │   ├── toggle.tsx
│   │   │   │   │   └── tooltip.tsx
│   │   │   │   ├── shared/           # Application shared components
│   │   │   │   │   ├── file-upload.tsx
│   │   │   │   │   ├── rich-text-editor.tsx
│   │   │   │   │   ├── stat-card.tsx
│   │   │   │   │   ├── empty-state.tsx
│   │   │   │   │   ├── confirm-dialog.tsx
│   │   │   │   │   ├── search-input.tsx
│   │   │   │   │   ├── page-header.tsx
│   │   │   │   │   ├── loading-spinner.tsx
│   │   │   │   │   ├── error-boundary.tsx
│   │   │   │   │   ├── language-switcher.tsx
│   │   │   │   │   ├── theme-toggle.tsx
│   │   │   │   │   └── user-avatar.tsx
│   │   │   │   ├── layout/
│   │   │   │   │   ├── public-layout.tsx
│   │   │   │   │   ├── admin-layout.tsx
│   │   │   │   │   ├── student-layout.tsx
│   │   │   │   │   ├── parent-layout.tsx
│   │   │   │   │   ├── auth-layout.tsx
│   │   │   │   │   ├── sidebar.tsx
│   │   │   │   │   ├── header.tsx
│   │   │   │   │   ├── footer.tsx
│   │   │   │   │   ├── navbar.tsx
│   │   │   │   │   ├── mobile-nav.tsx
│   │   │   │   │   └── breadcrumb-nav.tsx
│   │   │   │   └── landing/          # Landing page sections
│   │   │   │       ├── hero-section.tsx
│   │   │   │       ├── about-section.tsx
│   │   │   │       ├── programs-section.tsx
│   │   │   │       ├── courses-section.tsx
│   │   │   │       ├── teachers-section.tsx
│   │   │   │       ├── achievements-section.tsx
│   │   │   │       ├── statistics-section.tsx
│   │   │   │       ├── events-section.tsx
│   │   │   │       ├── news-section.tsx
│   │   │   │       ├── gallery-section.tsx
│   │   │   │       ├── testimonials-section.tsx
│   │   │   │       ├── donation-section.tsx
│   │   │   │       ├── contact-section.tsx
│   │   │   │       ├── google-map-section.tsx
│   │   │   │       └── newsletter-section.tsx
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── login.tsx
│   │   │   │   │   │   ├── register.tsx
│   │   │   │   │   │   ├── forgot-password.tsx
│   │   │   │   │   │   ├── reset-password.tsx
│   │   │   │   │   │   └── verify-email.tsx
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── login-form.tsx
│   │   │   │   │   │   ├── register-form.tsx
│   │   │   │   │   │   ├── forgot-password-form.tsx
│   │   │   │   │   │   └── social-login.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   ├── use-auth.ts
│   │   │   │   │   │   └── use-refresh-token.ts
│   │   │   │   │   └── services/
│   │   │   │   │       └── auth.service.ts
│   │   │   │   ├── admin/
│   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── dashboard.tsx
│   │   │   │   │   │   ├── students/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── detail.tsx
│   │   │   │   │   │   ├── parents/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── detail.tsx
│   │   │   │   │   │   ├── teachers/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── detail.tsx
│   │   │   │   │   │   ├── courses/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── curriculum.tsx
│   │   │   │   │   │   ├── classes/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── schedule.tsx
│   │   │   │   │   │   ├── attendance/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── take-attendance.tsx
│   │   │   │   │   │   │   └── reports.tsx
│   │   │   │   │   │   ├── exams/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── edit.tsx
│   │   │   │   │   │   │   └── grade.tsx
│   │   │   │   │   │   ├── results/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── publish.tsx
│   │   │   │   │   │   │   └── reports.tsx
│   │   │   │   │   │   ├── payments/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   ├── invoices.tsx
│   │   │   │   │   │   │   └── reports.tsx
│   │   │   │   │   │   ├── certificates/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── generate.tsx
│   │   │   │   │   │   │   └── templates.tsx
│   │   │   │   │   │   ├── announcements/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   └── edit.tsx
│   │   │   │   │   │   ├── news/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   └── edit.tsx
│   │   │   │   │   │   ├── events/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── create.tsx
│   │   │   │   │   │   │   └── edit.tsx
│   │   │   │   │   │   ├── gallery/
│   │   │   │   │   │   │   ├── list.tsx
│   │   │   │   │   │   │   ├── upload.tsx
│   │   │   │   │   │   │   └── albums.tsx
│   │   │   │   │   │   ├── permissions/
│   │   │   │   │   │   │   ├── roles.tsx
│   │   │   │   │   │   │   └── assign.tsx
│   │   │   │   │   │   ├── settings/
│   │   │   │   │   │   │   ├── general.tsx
│   │   │   │   │   │   │   ├── website.tsx
│   │   │   │   │   │   │   ├── email.tsx
│   │   │   │   │   │   │   └── payment.tsx
│   │   │   │   │   │   ├── analytics/
│   │   │   │   │   │   │   └── overview.tsx
│   │   │   │   │   │   └── logs/
│   │   │   │   │   │       └── activity-logs.tsx
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── admin-sidebar.tsx
│   │   │   │   │   │   ├── admin-header.tsx
│   │   │   │   │   │   ├── stats-overview.tsx
│   │   │   │   │   │   ├── recent-activity.tsx
│   │   │   │   │   │   └── quick-actions.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   ├── use-dashboard-stats.ts
│   │   │   │   │   │   └── use-activity-logs.ts
│   │   │   │   │   └── services/
│   │   │   │   │       ├── admin.service.ts
│   │   │   │   │       └── dashboard.service.ts
│   │   │   │   ├── student/
│   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── dashboard.tsx
│   │   │   │   │   │   ├── courses.tsx
│   │   │   │   │   │   ├── attendance.tsx
│   │   │   │   │   │   ├── exams.tsx
│   │   │   │   │   │   ├── results.tsx
│   │   │   │   │   │   ├── assignments.tsx
│   │   │   │   │   │   ├── downloads.tsx
│   │   │   │   │   │   ├── certificates.tsx
│   │   │   │   │   │   ├── notifications.tsx
│   │   │   │   │   │   ├── messages.tsx
│   │   │   │   │   │   ├── profile.tsx
│   │   │   │   │   │   └── settings.tsx
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── student-sidebar.tsx
│   │   │   │   │   │   ├── student-header.tsx
│   │   │   │   │   │   ├── course-card.tsx
│   │   │   │   │   │   ├── assignment-item.tsx
│   │   │   │   │   │   └── grade-chart.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   └── use-student-data.ts
│   │   │   │   │   └── services/
│   │   │   │   │       └── student.service.ts
│   │   │   │   └── parent/
│   │   │   │       ├── pages/
│   │   │   │       │   ├── dashboard.tsx
│   │   │   │       │   ├── children.tsx
│   │   │   │       │   ├── attendance.tsx
│   │   │   │       │   ├── results.tsx
│   │   │   │       │   ├── fees.tsx
│   │   │   │       │   ├── notifications.tsx
│   │   │   │       │   ├── messages.tsx
│   │   │   │       │   ├── profile.tsx
│   │   │   │       │   └── settings.tsx
│   │   │   │       ├── components/
│   │   │   │       │   ├── parent-sidebar.tsx
│   │   │   │       │   ├── parent-header.tsx
│   │   │   │       │   ├── child-selector.tsx
│   │   │   │       │   └── fee-summary.tsx
│   │   │   │       ├── hooks/
│   │   │   │       │   └── use-parent-data.ts
│   │   │   │       └── services/
│   │   │   │           └── parent.service.ts
│   │   │   ├── hooks/                # Global hooks
│   │   │   │   ├── use-debounce.ts
│   │   │   │   ├── use-pagination.ts
│   │   │   │   ├── use-media-query.ts
│   │   │   │   ├── use-local-storage.ts
│   │   │   │   ├── use-click-outside.ts
│   │   │   │   ├── use-intersection-observer.ts
│   │   │   │   └── use-scroll-to-top.ts
│   │   │   ├── lib/                  # Utility libraries
│   │   │   │   ├── axios.ts          # Axios instance with interceptors
│   │   │   │   ├── constants.ts
│   │   │   │   ├── utils.ts
│   │   │   │   ├── validators.ts     # Zod schemas
│   │   │   │   ├── formatters.ts     # Date, currency, name formatters
│   │   │   │   └── permissions.ts    # Role-based permission checks
│   │   │   ├── i18n/
│   │   │   │   ├── index.ts          # i18next configuration
│   │   │   │   ├── locales/
│   │   │   │   │   ├── en/
│   │   │   │   │   │   ├── common.json
│   │   │   │   │   │   ├── auth.json
│   │   │   │   │   │   ├── landing.json
│   │   │   │   │   │   ├── admin.json
│   │   │   │   │   │   ├── student.json
│   │   │   │   │   │   ├── parent.json
│   │   │   │   │   │   └── validation.json
│   │   │   │   │   ├── so/
│   │   │   │   │   │   ├── common.json
│   │   │   │   │   │   ├── auth.json
│   │   │   │   │   │   ├── landing.json
│   │   │   │   │   │   ├── admin.json
│   │   │   │   │   │   ├── student.json
│   │   │   │   │   │   ├── parent.json
│   │   │   │   │   │   └── validation.json
│   │   │   │   │   └── ar/
│   │   │   │   │       ├── common.json
│   │   │   │   │       ├── auth.json
│   │   │   │   │       ├── landing.json
│   │   │   │   │       ├── admin.json
│   │   │   │   │       ├── student.json
│   │   │   │   │       ├── parent.json
│   │   │   │   │       └── validation.json
│   │   │   ├── store/                # Global state (Context/Zustand)
│   │   │   │   ├── auth-context.tsx
│   │   │   │   ├── theme-context.tsx
│   │   │   │   └── notification-context.tsx
│   │   │   ├── routes/
│   │   │   │   ├── index.tsx         # Route definitions
│   │   │   │   ├── public-routes.tsx
│   │   │   │   ├── admin-routes.tsx
│   │   │   │   ├── student-routes.tsx
│   │   │   │   ├── parent-routes.tsx
│   │   │   │   ├── auth-routes.tsx
│   │   │   │   └── protected-route.tsx
│   │   │   ├── types/                # TypeScript type definitions
│   │   │   │   ├── auth.types.ts
│   │   │   │   ├── user.types.ts
│   │   │   │   ├── course.types.ts
│   │   │   │   ├── exam.types.ts
│   │   │   │   ├── payment.types.ts
│   │   │   │   ├── common.types.ts
│   │   │   │   └── api.types.ts
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── vite-env.d.ts
│   │   ├── .env.example
│   │   ├── .eslintrc.cjs
│   │   ├── .prettierrc
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── postcss.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── backend/                      # Express.js Backend
│       ├── src/
│       │   ├── config/
│       │   │   ├── database.ts       # MongoDB connection
│       │   │   ├── redis.ts          # Redis connection
│       │   │   ├── email.ts          # Nodemailer transporter
│       │   │   ├── jwt.ts            # JWT configuration
│       │   │   ├── cors.ts           # CORS options
│       │   │   ├── logger.ts         # Winston logger
│       │   │   ├── multer.ts         # File upload config
│       │   │   └── bull.ts           # Bull queue config
│       │   ├── models/               # Mongoose Models
│       │   │   ├── user.model.ts
│       │   │   ├── student.model.ts
│       │   │   ├── parent.model.ts
│       │   │   ├── teacher.model.ts
│       │   │   ├── course.model.ts
│       │   │   ├── class.model.ts
│       │   │   ├── attendance.model.ts
│       │   │   ├── exam.model.ts
│       │   │   ├── result.model.ts
│       │   │   ├── assignment.model.ts
│       │   │   ├── payment.model.ts
│       │   │   ├── certificate.model.ts
│       │   │   ├── announcement.model.ts
│       │   │   ├── news.model.ts
│       │   │   ├── event.model.ts
│       │   │   ├── gallery.model.ts
│       │   │   ├── message.model.ts
│       │   │   ├── notification.model.ts
│       │   │   ├── role.model.ts
│       │   │   ├── permission.model.ts
│       │   │   ├── setting.model.ts
│       │   │   ├── donation.model.ts
│       │   │   ├── log.model.ts
│       │   │   └── refresh-token.model.ts
│       │   ├── repositories/         # Data access layer
│       │   │   ├── base.repository.ts
│       │   │   ├── user.repository.ts
│       │   │   ├── student.repository.ts
│       │   │   ├── parent.repository.ts
│       │   │   ├── teacher.repository.ts
│       │   │   ├── course.repository.ts
│       │   │   ├── class.repository.ts
│       │   │   ├── attendance.repository.ts
│       │   │   ├── exam.repository.ts
│       │   │   ├── result.repository.ts
│       │   │   ├── assignment.repository.ts
│       │   │   ├── payment.repository.ts
│       │   │   ├── certificate.repository.ts
│       │   │   ├── announcement.repository.ts
│       │   │   ├── news.repository.ts
│       │   │   ├── event.repository.ts
│       │   │   ├── gallery.repository.ts
│       │   │   ├── message.repository.ts
│       │   │   ├── notification.repository.ts
│       │   │   ├── role.repository.ts
│       │   │   ├── permission.repository.ts
│       │   │   ├── setting.repository.ts
│       │   │   ├── donation.repository.ts
│       │   │   └── log.repository.ts
│       │   ├── services/             # Business logic layer
│       │   │   ├── auth.service.ts
│       │   │   ├── user.service.ts
│       │   │   ├── student.service.ts
│       │   │   ├── parent.service.ts
│       │   │   ├── teacher.service.ts
│       │   │   ├── course.service.ts
│       │   │   ├── class.service.ts
│       │   │   ├── attendance.service.ts
│       │   │   ├── exam.service.ts
│       │   │   ├── result.service.ts
│       │   │   ├── assignment.service.ts
│       │   │   ├── payment.service.ts
│       │   │   ├── certificate.service.ts
│       │   │   ├── announcement.service.ts
│       │   │   ├── news.service.ts
│       │   │   ├── event.service.ts
│       │   │   ├── gallery.service.ts
│       │   │   ├── message.service.ts
│       │   │   ├── notification.service.ts
│       │   │   ├── role.service.ts
│       │   │   ├── permission.service.ts
│       │   │   ├── setting.service.ts
│       │   │   ├── donation.service.ts
│       │   │   ├── email.service.ts
│       │   │   ├── upload.service.ts
│       │   │   └── analytics.service.ts
│       │   ├── controllers/          # Request/Response handlers
│       │   │   ├── auth.controller.ts
│       │   │   ├── user.controller.ts
│       │   │   ├── student.controller.ts
│       │   │   ├── parent.controller.ts
│       │   │   ├── teacher.controller.ts
│       │   │   ├── course.controller.ts
│       │   │   ├── class.controller.ts
│       │   │   ├── attendance.controller.ts
│       │   │   ├── exam.controller.ts
│       │   │   ├── result.controller.ts
│       │   │   ├── assignment.controller.ts
│       │   │   ├── payment.controller.ts
│       │   │   ├── certificate.controller.ts
│       │   │   ├── announcement.controller.ts
│       │   │   ├── news.controller.ts
│       │   │   ├── event.controller.ts
│       │   │   ├── gallery.controller.ts
│       │   │   ├── message.controller.ts
│       │   │   ├── notification.controller.ts
│       │   │   ├── role.controller.ts
│       │   │   ├── permission.controller.ts
│       │   │   ├── setting.controller.ts
│       │   │   ├── donation.controller.ts
│       │   │   ├── upload.controller.ts
│       │   │   ├── analytics.controller.ts
│       │   │   └── website.controller.ts  # Public website data
│       │   ├── routes/               # Route definitions
│       │   │   ├── index.ts          # Main router
│       │   │   ├── v1/
│       │   │   │   ├── auth.routes.ts
│       │   │   │   ├── user.routes.ts
│       │   │   │   ├── student.routes.ts
│       │   │   │   ├── parent.routes.ts
│       │   │   │   ├── teacher.routes.ts
│       │   │   │   ├── course.routes.ts
│       │   │   │   ├── class.routes.ts
│       │   │   │   ├── attendance.routes.ts
│       │   │   │   ├── exam.routes.ts
│       │   │   │   ├── result.routes.ts
│       │   │   │   ├── assignment.routes.ts
│       │   │   │   ├── payment.routes.ts
│       │   │   │   ├── certificate.routes.ts
│       │   │   │   ├── announcement.routes.ts
│       │   │   │   ├── news.routes.ts
│       │   │   │   ├── event.routes.ts
│       │   │   │   ├── gallery.routes.ts
│       │   │   │   ├── message.routes.ts
│       │   │   │   ├── notification.routes.ts
│       │   │   │   ├── role.routes.ts
│       │   │   │   ├── permission.routes.ts
│       │   │   │   ├── setting.routes.ts
│       │   │   │   ├── donation.routes.ts
│       │   │   │   ├── upload.routes.ts
│       │   │   │   ├── analytics.routes.ts
│       │   │   │   └── website.routes.ts
│       │   │   └── index.ts
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts         # JWT verification
│       │   │   ├── role.middleware.ts         # Role-based access
│       │   │   ├── validate.middleware.ts     # Joi schema validation
│       │   │   ├── upload.middleware.ts       # File upload handling
│       │   │   ├── rate-limiter.middleware.ts
│       │   │   ├── sanitize.middleware.ts
│       │   │   ├── error-handler.middleware.ts
│       │   │   ├── async-handler.middleware.ts
│       │   │   ├── logger.middleware.ts
│       │   │   └── i18n.middleware.ts         # Language detection
│       │   ├── validators/           # Joi validation schemas
│       │   │   ├── auth.validator.ts
│       │   │   ├── user.validator.ts
│       │   │   ├── student.validator.ts
│       │   │   ├── parent.validator.ts
│       │   │   ├── teacher.validator.ts
│       │   │   ├── course.validator.ts
│       │   │   ├── class.validator.ts
│       │   │   ├── attendance.validator.ts
│       │   │   ├── exam.validator.ts
│       │   │   ├── result.validator.ts
│       │   │   ├── assignment.validator.ts
│       │   │   ├── payment.validator.ts
│       │   │   ├── certificate.validator.ts
│       │   │   ├── announcement.validator.ts
│       │   │   ├── news.validator.ts
│       │   │   ├── event.validator.ts
│       │   │   ├── gallery.validator.ts
│       │   │   ├── message.validator.ts
│       │   │   ├── notification.validator.ts
│       │   │   ├── role.validator.ts
│       │   │   ├── permission.validator.ts
│       │   │   ├── setting.validator.ts
│       │   │   ├── donation.validator.ts
│       │   │   └── common.validator.ts
│       │   ├── utils/
│       │   │   ├── api-response.ts    # Standardized API response
│       │   │   ├── api-error.ts       # Custom error classes
│       │   │   ├── jwt.ts             # JWT sign/verify helpers
│       │   │   ├── password.ts        # bcrypt hash/compare
│       │   │   ├── pagination.ts      # Pagination helper
│       │   │   ├── email.ts           # Email sending helper
│       │   │   ├── file.ts            # File handling utilities
│       │   │   ├── token.ts           # Token generation
│       │   │   ├── slug.ts            # URL slug generation
│       │   │   └── date.ts            # Date manipulation (Hijri support)
│       │   ├── jobs/                  # Background jobs (Bull)
│       │   │   ├── email.job.ts
│       │   │   ├── certificate.job.ts
│       │   │   ├── report.job.ts
│       │   │   └── notification.job.ts
│       │   ├── templates/             # Email templates (Handlebars)
│       │   │   ├── layouts/
│       │   │   │   └── main.hbs
│       │   │   ├── welcome.hbs
│       │   │   ├── verify-email.hbs
│       │   │   ├── reset-password.hbs
│       │   │   ├── payment-receipt.hbs
│       │   │   ├── certificate.hbs
│       │   │   └── notification.hbs
│       │   ├── constants/
│       │   │   ├── roles.ts
│       │   │   ├── permissions.ts
│       │   │   ├── status.ts
│       │   │   └── index.ts
│       │   ├── types/                # TypeScript types
│       │   │   ├── express.d.ts      # Express augmentation
│       │   │   └── index.ts
│       │   ├── seeds/                # Database seeders
│       │   │   ├── admin.seed.ts
│       │   │   ├── roles.seed.ts
│       │   │   └── settings.seed.ts
│       │   ├── app.ts                # Express app setup
│       │   └── server.ts             # Server entry point
│       ├── tests/
│       │   ├── unit/
│       │   │   ├── services/
│       │   │   └── utils/
│       │   ├── integration/
│       │   │   ├── auth.test.ts
│       │   │   ├── student.test.ts
│       │   │   └── course.test.ts
│       │   └── fixtures/
│       │       ├── users.fixture.ts
│       │       └── courses.fixture.ts
│       ├── .env.example
│       ├── .eslintrc.cjs
│       ├── .prettierrc
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── jest.config.ts
│       ├── nodemon.json
│       ├── package.json
│       ├── tsconfig.json
│       └── ecosystem.config.js      # PM2 configuration
│
├── packages/                         # Shared packages (Turborepo)
│   ├── shared-types/                 # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── user.types.ts
│   │   │   ├── api.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── shared-utils/                 # Shared utilities
│   │   ├── src/
│   │   │   ├── date.ts
│   │   │   ├── string.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── eslint-config/               # Shared ESLint config
│       ├── index.js
│       └── package.json
│
├── .gitignore
├── .dockerignore
├── docker-compose.yml                # Development Docker setup
├── turbo.json                        # Turborepo config
├── package.json                      # Root package.json (workspaces)
├── pnpm-workspace.yaml
├── README.md
├── ARCHITECTURE.md                   # This document
├── CONTRIBUTING.md
├── CHANGELOG.md
└── LICENSE
```

---

## 4. Database Design & Collections

### 4.1 MongoDB Collections (25 Collections)

#### 4.1.1 `users`
The central authentication collection. All roles (admin, teacher, student, parent) derive from this base.

| Field | Type | Required | Indexed | Description |
|---|---|---|---|---|
| `_id` | ObjectId | Yes | PK | Unique identifier |
| `email` | String | Yes | Unique, Sparse | Email address |
| `phone` | String | No | Unique, Sparse | Phone number |
| `password` | String | Yes | No | bcrypt hashed password |
| `role` | String | Yes | Yes | `admin`, `teacher`, `student`, `parent` |
| `isVerified` | Boolean | No | No | Email verified flag |
| `isActive` | Boolean | No | No | Account active flag |
| `lastLogin` | Date | No | No | Last login timestamp |
| `preferredLanguage` | String | No | No | `en`, `so`, `ar` |
| `refreshTokens` | [String] | No | No | Array of valid refresh token hashes |
| `createdAt` | Date | Auto | Yes | Creation timestamp |
| `updatedAt` | Date | Auto | No | Update timestamp |

**Indexes:** `{ email: 1 }` unique sparse, `{ role: 1 }`, `{ isActive: 1 }`

#### 4.1.2 `profiles`
Stores extended profile information for all user types.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | Yes | Reference to User |
| `firstName` | String | Yes | First name |
| `lastName` | String | Yes | Last name |
| `gender` | String | Yes | `male`, `female` |
| `dateOfBirth` | Date | No | Date of birth |
| `avatar` | String | No | Avatar URL |
| `address` | Object | No | `{ street, city, state, country, zip }` |
| `emergencyContact` | Object | No | `{ name, phone, relationship }` |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ user: 1 }` unique

#### 4.1.3 `students`
Student-specific data extending the user and profile.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | Yes | Reference to User |
| `profile` | ObjectId (ref: Profile) | Yes | Reference to Profile |
| `studentId` | String | Yes | Unique student ID (e.g., STU-2026-0001) |
| `parent` | ObjectId (ref: Parent) | No | Reference to Parent |
| `enrollmentDate` | Date | Yes | Date of enrollment |
| `status` | String | Yes | `active`, `inactive`, `graduated`, `suspended` |
| `grade` | String | No | Current grade/level |
| `medicalNotes` | String | No | Medical information |
| `enrolledCourses` | [ObjectId] | No | Array of enrolled Course IDs |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ user: 1 }` unique, `{ studentId: 1 }` unique, `{ parent: 1 }`, `{ status: 1 }`

#### 4.1.4 `parents`
Parent-specific data.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | Yes | Reference to User |
| `profile` | ObjectId (ref: Profile) | Yes | Reference to Profile |
| `children` | [ObjectId] | No | Array of Student IDs |
| `occupation` | String | No | Occupation |
| `relationship` | String | Yes | `father`, `mother`, `guardian` |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ user: 1 }` unique, `{ children: 1 }`

#### 4.1.5 `teachers`
Teacher-specific data.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | Yes | Reference to User |
| `profile` | ObjectId (ref: Profile) | Yes | Reference to Profile |
| `teacherId` | String | Yes | Unique teacher ID (e.g., TCH-2026-0001) |
| `qualification` | String | No | Highest qualification |
| `specialization` | [String] | No | Areas of expertise (Quran, Fiqh, Arabic, etc.) |
| `experience` | Number | No | Years of experience |
| `bio` | String | No | Biography |
| `courses` | [ObjectId] | No | Assigned courses |
| `joiningDate` | Date | Yes | Date of joining |
| `status` | String | Yes | `active`, `inactive`, `on_leave` |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ user: 1 }` unique, `{ teacherId: 1 }` unique, `{ specialization: 1 }`

#### 4.1.6 `courses`
Islamic educational courses/programs.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `title` | Object | Yes | `{ en, so, ar }` multilingual title |
| `slug` | String | Yes | URL-friendly slug |
| `description` | Object | Yes | `{ en, so, ar }` multilingual description |
| `category` | String | Yes | `quran`, `fiqh`, `aqeedah`, `seerah`, `arabic`, `tajweed`, `hadith`, `akhlaq` |
| `level` | String | Yes | `beginner`, `intermediate`, `advanced` |
| `duration` | Number | Yes | Duration in weeks |
| `fee` | Number | No | Course fee (0 for free) |
| `teacher` | ObjectId (ref: Teacher) | Yes | Assigned teacher |
| `maxStudents` | Number | Yes | Maximum capacity |
| `thumbnail` | String | No | Course image URL |
| `syllabus` | [Object] | No | `[{ week, topic, description }]` |
| `prerequisites` | [String] | No | Prerequisite course slugs |
| `status` | String | Yes | `draft`, `published`, `archived` |
| `startDate` | Date | No | Course start date |
| `endDate` | Date | No | Course end date |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ category: 1 }`, `{ status: 1 }`, `{ teacher: 1 }`

#### 4.1.7 `classes`
Scheduled class sessions within a course.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `course` | ObjectId (ref: Course) | Yes | Parent course |
| `title` | String | Yes | Class title |
| `dayOfWeek` | Number | Yes | 0-6 (Sunday-Saturday) |
| `startTime` | String | Yes | HH:mm format |
| `endTime` | String | Yes | HH:mm format |
| `room` | String | No | Physical/virtual room |
| `meetingLink` | String | No | Zoom/Google Meet link |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ course: 1 }`, `{ dayOfWeek: 1 }`

#### 4.1.8 `attendance`
Attendance records for classes.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `class` | ObjectId (ref: Class) | Yes | Class session |
| `student` | ObjectId (ref: Student) | Yes | Student |
| `date` | Date | Yes | Date of attendance |
| `status` | String | Yes | `present`, `absent`, `late`, `excused` |
| `notes` | String | No | Additional notes |
| `markedBy` | ObjectId (ref: User) | Yes | Who marked attendance |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ class: 1, student: 1, date: 1 }` unique compound, `{ student: 1 }`, `{ date: 1 }`

#### 4.1.9 `exams`
Examination records.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `course` | ObjectId (ref: Course) | Yes | Associated course |
| `title` | Object | Yes | `{ en, so, ar }` exam title |
| `type` | String | Yes | `quiz`, `midterm`, `final`, `oral`, `practical` |
| `totalMarks` | Number | Yes | Maximum marks |
| `passingMarks` | Number | Yes | Minimum passing marks |
| `duration` | Number | Yes | Duration in minutes |
| `date` | Date | Yes | Exam date |
| `status` | String | Yes | `draft`, `scheduled`, `ongoing`, `completed` |
| `questions` | [Object] | No | `[{ question, options, correctAnswer, marks }]` |
| `createdBy` | ObjectId (ref: User) | Yes | Creator |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ course: 1 }`, `{ date: 1 }`, `{ status: 1 }`

#### 4.1.10 `results`
Student exam results.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `exam` | ObjectId (ref: Exam) | Yes | Associated exam |
| `student` | ObjectId (ref: Student) | Yes | Student |
| `marksObtained` | Number | Yes | Marks scored |
| `percentage` | Number | Yes | Calculated percentage |
| `grade` | String | Yes | Letter grade (A+, A, B, C, D, F) |
| `status` | String | Yes | `pass`, `fail` |
| `remarks` | String | No | Teacher remarks |
| `publishedAt` | Date | No | When result was published |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ exam: 1, student: 1 }` unique compound, `{ student: 1 }`, `{ status: 1 }`

#### 4.1.11 `assignments`
Homework and assignments.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `course` | ObjectId (ref: Course) | Yes | Associated course |
| `title` | Object | Yes | `{ en, so, ar }` title |
| `description` | Object | Yes | `{ en, so, ar }` description |
| `dueDate` | Date | Yes | Submission deadline |
| `totalMarks` | Number | Yes | Maximum marks |
| `attachments` | [String] | No | File URLs |
| `createdBy` | ObjectId (ref: User) | Yes | Creator |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ course: 1 }`, `{ dueDate: 1 }`

#### 4.1.12 `submissions`
Student assignment submissions.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `assignment` | ObjectId (ref: Assignment) | Yes | Associated assignment |
| `student` | ObjectId (ref: Student) | Yes | Student |
| `content` | String | No | Text submission |
| `attachments` | [String] | No | File URLs |
| `submittedAt` | Date | Yes | Submission timestamp |
| `marksObtained` | Number | No | Graded marks |
| `feedback` | String | No | Teacher feedback |
| `status` | String | Yes | `submitted`, `late`, `graded`, `returned` |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ assignment: 1, student: 1 }` unique compound, `{ status: 1 }`

#### 4.1.13 `payments`
Fee and payment records.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `student` | ObjectId (ref: Student) | Yes | Student |
| `amount` | Number | Yes | Payment amount |
| `type` | String | Yes | `tuition`, `registration`, `exam`, `material`, `donation` |
| `method` | String | Yes | `cash`, `bank_transfer`, `mobile_money`, `online` |
| `status` | String | Yes | `pending`, `completed`, `failed`, `refunded` |
| `transactionId` | String | No | External transaction reference |
| `receiptNumber` | String | Yes | Auto-generated receipt number |
| `dueDate` | Date | No | Payment due date |
| `paidAt` | Date | No | Payment completion date |
| `notes` | String | No | Additional notes |
| `recordedBy` | ObjectId (ref: User) | Yes | Who recorded the payment |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ student: 1 }`, `{ status: 1 }`, `{ type: 1 }`, `{ receiptNumber: 1 }` unique

#### 4.1.14 `certificates`
Generated certificates.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `student` | ObjectId (ref: Student) | Yes | Student |
| `course` | ObjectId (ref: Course) | Yes | Course completed |
| `type` | String | Yes | `completion`, `achievement`, `participation`, `memorization` |
| `certificateNumber` | String | Yes | Unique certificate number |
| `issueDate` | Date | Yes | Date issued |
| `fileUrl` | String | Yes | PDF file URL |
| `templateId` | String | No | Template used |
| `metadata` | Object | No | Additional certificate data |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ student: 1 }`, `{ certificateNumber: 1 }` unique, `{ course: 1 }`

#### 4.1.15 `announcements`
System-wide announcements.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `title` | Object | Yes | `{ en, so, ar }` title |
| `content` | Object | Yes | `{ en, so, ar }` content |
| `type` | String | Yes | `general`, `important`, `emergency`, `event` |
| `targetRoles` | [String] | No | Specific roles to target (empty = all) |
| `targetCourses` | [ObjectId] | No | Specific courses |
| `createdBy` | ObjectId (ref: User) | Yes | Creator |
| `isActive` | Boolean | No | Active flag |
| `expiresAt` | Date | No | Expiry date |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ type: 1 }`, `{ createdAt: -1 }`, `{ isActive: 1 }`

#### 4.1.16 `news`
News articles for the public website.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `title` | Object | Yes | `{ en, so, ar }` title |
| `slug` | String | Yes | URL-friendly slug |
| `content` | Object | Yes | `{ en, so, ar }` content |
| `summary` | Object | Yes | `{ en, so, ar }` summary |
| `featuredImage` | String | No | Image URL |
| `author` | ObjectId (ref: User) | Yes | Author |
| `tags` | [String] | No | Tags |
| `status` | String | Yes | `draft`, `published`, `archived` |
| `publishedAt` | Date | No | Publication date |
| `viewCount` | Number | No | View counter |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ status: 1 }`, `{ publishedAt: -1 }`, `{ tags: 1 }`

#### 4.1.17 `events`
Events/activities management.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `title` | Object | Yes | `{ en, so, ar }` title |
| `slug` | String | Yes | URL-friendly slug |
| `description` | Object | Yes | `{ en, so, ar }` description |
| `type` | String | Yes | `lecture`, `workshop`, `competition`, `celebration`, `conference`, `iftar` |
| `startDate` | Date | Yes | Start date/time |
| `endDate` | Date | Yes | End date/time |
| `location` | Object | Yes | `{ venue, address, city, coordinates }` |
| `featuredImage` | String | No | Event image |
| `maxAttendees` | Number | No | Capacity |
| `registrationRequired` | Boolean | No | Needs registration |
| `fee` | Number | No | Event fee |
| `speaker` | String | No | Speaker/guest name |
| `status` | String | Yes | `upcoming`, `ongoing`, `completed`, `cancelled` |
| `createdBy` | ObjectId (ref: User) | Yes | Creator |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ status: 1 }`, `{ startDate: 1 }`, `{ type: 1 }`

#### 4.1.18 `galleries`
Image/video galleries.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `title` | Object | Yes | `{ en, so, ar }` album title |
| `slug` | String | Yes | URL-friendly slug |
| `description` | Object | No | `{ en, so, ar }` description |
| `type` | String | Yes | `image`, `video`, `mixed` |
| `coverImage` | String | Yes | Cover image URL |
| `items` | [Object] | No | `[{ url, caption, type, order }]` |
| `event` | ObjectId (ref: Event) | No | Related event |
| `status` | String | Yes | `draft`, `published` |
| `createdBy` | ObjectId (ref: User) | Yes | Uploader |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ status: 1 }`, `{ type: 1 }`

#### 4.1.19 `messages`
Internal messaging system.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `conversationId` | String | Yes | Group messages by conversation |
| `sender` | ObjectId (ref: User) | Yes | Sender |
| `receiver` | ObjectId (ref: User) | Yes | Receiver |
| `subject` | String | No | Message subject |
| `content` | String | Yes | Message body |
| `attachments` | [String] | No | File attachments |
| `isRead` | Boolean | No | Read status |
| `readAt` | Date | No | When read |
| `parentMessage` | ObjectId | No | For threaded replies |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ conversationId: 1 }`, `{ sender: 1 }`, `{ receiver: 1 }`, `{ isRead: 1 }`

#### 4.1.20 `notifications`
User notifications.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | Yes | Recipient |
| `title` | Object | Yes | `{ en, so, ar }` title |
| `message` | Object | Yes | `{ en, so, ar }` message |
| `type` | String | Yes | `info`, `success`, `warning`, `error` |
| `category` | String | Yes | `academic`, `payment`, `event`, `system`, `message` |
| `link` | String | No | Action link |
| `isRead` | Boolean | No | Read status |
| `readAt` | Date | No | When read |
| `createdAt` | Date | Auto | Creation timestamp |

**Indexes:** `{ user: 1, isRead: 1 }`, `{ createdAt: -1 }`, `{ category: 1 }`

#### 4.1.21 `roles`
Role definitions (RBAC).

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `name` | String | Yes | Role name `super_admin`, `admin`, `moderator`, `teacher`, `parent`, `student` |
| `slug` | String | Yes | URL-friendly slug |
| `description` | String | No | Role description |
| `permissions` | [String] | Yes | Array of permission slugs |
| `isSystem` | Boolean | No | System-defined (cannot be deleted) |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ name: 1 }` unique

#### 4.1.22 `permissions`
Permission definitions.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `name` | String | Yes | Human-readable name |
| `slug` | String | Yes | `module.action` format (e.g., `students.create`) |
| `module` | String | Yes | Module name |
| `action` | String | Yes | `create`, `read`, `update`, `delete`, `export`, `manage` |
| `description` | String | No | Permission description |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ slug: 1 }` unique, `{ module: 1 }`

#### 4.1.23 `settings`
System configuration (key-value store with grouping).

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `group` | String | Yes | `general`, `website`, `email`, `payment`, `academic` |
| `key` | String | Yes | Setting key |
| `value` | Mixed | Yes | Setting value (any type) |
| `type` | String | Yes | `string`, `number`, `boolean`, `json`, `image` |
| `label` | Object | Yes | `{ en, so, ar }` display label |
| `isPublic` | Boolean | No | Accessible without auth |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ group: 1, key: 1 }` unique compound, `{ isPublic: 1 }`

#### 4.1.24 `donations`
Donation records.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `donor` | ObjectId (ref: User) | No | Registered donor (null if anonymous) |
| `name` | String | Yes | Donor name |
| `email` | String | No | Donor email |
| `amount` | Number | Yes | Donation amount |
| `currency` | String | Yes | `USD`, `SOS` (Somali Shilling) |
| `type` | String | Yes | `one_time`, `monthly`, `zakat`, `sadaqah`, `fitra`, `general` |
| `method` | String | Yes | Payment method |
| `status` | String | Yes | `pending`, `completed`, `failed` |
| `message` | String | No | Donor message |
| `isAnonymous` | Boolean | No | Anonymous donation |
| `transactionId` | String | No | Payment gateway reference |
| `receiptSent` | Boolean | No | Receipt emailed |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Indexes:** `{ status: 1 }`, `{ type: 1 }`, `{ createdAt: -1 }`

#### 4.1.25 `logs`
Activity/audit logs.

| Field | Type | Required | Description |
|---|---|---|
| `_id` | ObjectId | Yes | Unique identifier |
| `user` | ObjectId (ref: User) | No | User (null for system) |
| `action` | String | Yes | Action performed |
| `module` | String | Yes | Module name |
| `resourceType` | String | Yes | Resource type (e.g., `student`, `course`) |
| `resourceId` | ObjectId | No | Affected resource |
| `details` | Object | No | Change details (old/new values) |
| `ipAddress` | String | No | Client IP |
| `userAgent` | String | No | Client user agent |
| `status` | String | Yes | `success`, `failure` |
| `createdAt` | Date | Auto | Creation timestamp |

**Indexes:** `{ user: 1 }`, `{ action: 1 }`, `{ module: 1 }`, `{ createdAt: -1 }` (TTL: 90 days)

---

## 5. Complete API List

### 5.1 API Versioning & Base URL

```
Base URL:  https://api.masjidalrahma.com/api/v1
Version:   v1 (current)
Format:    JSON (application/json)
Auth:      Bearer <JWT Access Token>
```

### 5.2 Standardized API Response Format

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "errors": null,
  "timestamp": "2026-07-08T10:37:31.000Z",
  "requestId": "req_abc123"
}
```

### 5.3 Complete API Endpoints

#### 5.3.1 Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Register new user |
| `POST` | `/auth/login` | None | Login with email/password |
| `POST` | `/auth/logout` | Required | Logout and invalidate refresh token |
| `POST` | `/auth/refresh-token` | None | Refresh access token |
| `POST` | `/auth/forgot-password` | None | Send password reset email |
| `POST` | `/auth/reset-password/:token` | None | Reset password with token |
| `POST` | `/auth/verify-email/:token` | None | Verify email address |
| `POST` | `/auth/resend-verification` | Required | Resend verification email |
| `GET` | `/auth/me` | Required | Get current user profile |
| `PATCH` | `/auth/change-password` | Required | Change password |
| `PATCH` | `/auth/update-profile` | Required | Update own profile |
| `POST` | `/auth/upload-avatar` | Required | Upload profile picture |

#### 5.3.2 Users (`/api/v1/users`) — Admin only

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/users` | Required | admin | List all users (paginated) |
| `GET` | `/users/:id` | Required | admin | Get user details |
| `POST` | `/users` | Required | admin | Create user |
| `PATCH` | `/users/:id` | Required | admin | Update user |
| `DELETE` | `/users/:id` | Required | admin | Soft delete user |
| `PATCH` | `/users/:id/activate` | Required | admin | Activate/deactivate user |
| `PATCH` | `/users/:id/role` | Required | admin | Change user role |

#### 5.3.3 Students (`/api/v1/students`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/students` | Required | admin, teacher | List students (paginated, filterable) |
| `GET` | `/students/:id` | Required | admin, teacher, parent | Get student details |
| `POST` | `/students` | Required | admin | Create student |
| `PATCH` | `/students/:id` | Required | admin | Update student |
| `DELETE` | `/students/:id` | Required | admin | Delete student |
| `GET` | `/students/:id/courses` | Required | admin, teacher, parent, student | Get student courses |
| `GET` | `/students/:id/attendance` | Required | admin, teacher, parent, student | Get student attendance |
| `GET` | `/students/:id/results` | Required | admin, teacher, parent, student | Get student results |
| `GET` | `/students/:id/payments` | Required | admin, parent, student | Get student payments |
| `GET` | `/students/:id/certificates` | Required | admin, parent, student | Get student certificates |
| `POST` | `/students/bulk-import` | Required | admin | Bulk import students (CSV/Excel) |
| `GET` | `/students/export` | Required | admin | Export students (CSV/Excel) |

#### 5.3.4 Parents (`/api/v1/parents`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/parents` | Required | admin | List parents |
| `GET` | `/parents/:id` | Required | admin, parent | Get parent details |
| `POST` | `/parents` | Required | admin | Create parent |
| `PATCH` | `/parents/:id` | Required | admin, parent | Update parent |
| `DELETE` | `/parents/:id` | Required | admin | Delete parent |
| `GET` | `/parents/:id/children` | Required | admin, parent | Get parent's children |
| `POST` | `/parents/:id/link-child` | Required | admin | Link child to parent |

#### 5.3.5 Teachers (`/api/v1/teachers`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/teachers` | Required | admin | List teachers |
| `GET` | `/teachers/:id` | Required | admin, teacher | Get teacher details |
| `POST` | `/teachers` | Required | admin | Create teacher |
| `PATCH` | `/teachers/:id` | Required | admin, teacher | Update teacher |
| `DELETE` | `/teachers/:id` | Required | admin | Delete teacher |
| `GET` | `/teachers/:id/courses` | Required | admin, teacher | Get teacher courses |
| `GET` | `/teachers/:id/schedule` | Required | admin, teacher | Get teacher schedule |

#### 5.3.6 Courses (`/api/v1/courses`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/courses` | None | public | List published courses (public) |
| `GET` | `/courses/admin` | Required | admin, teacher | List all courses (admin) |
| `GET` | `/courses/:slug` | None | public | Get course details |
| `GET` | `/courses/:id/admin` | Required | admin, teacher | Get course details (admin) |
| `POST` | `/courses` | Required | admin | Create course |
| `PATCH` | `/courses/:id` | Required | admin | Update course |
| `DELETE` | `/courses/:id` | Required | admin | Delete course |
| `POST` | `/courses/:id/enroll` | Required | admin, student | Enroll student |
| `POST` | `/courses/:id/unenroll` | Required | admin | Unenroll student |
| `GET` | `/courses/:id/students` | Required | admin, teacher | Get enrolled students |
| `GET` | `/courses/categories` | None | public | List course categories |

#### 5.3.7 Classes (`/api/v1/classes`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/classes` | Required | admin, teacher | List classes |
| `GET` | `/classes/:id` | Required | admin, teacher | Get class details |
| `POST` | `/classes` | Required | admin | Create class |
| `PATCH` | `/classes/:id` | Required | admin | Update class |
| `DELETE` | `/classes/:id` | Required | admin | Delete class |
| `GET` | `/classes/course/:courseId` | Required | admin, teacher, student | Get classes by course |
| `GET` | `/classes/schedule` | Required | admin, teacher, student | Get weekly schedule |

#### 5.3.8 Attendance (`/api/v1/attendance`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/attendance` | Required | admin, teacher | List attendance records |
| `GET` | `/attendance/:id` | Required | admin, teacher | Get attendance record |
| `POST` | `/attendance` | Required | teacher | Mark attendance |
| `POST` | `/attendance/bulk` | Required | teacher | Bulk mark attendance |
| `PATCH` | `/attendance/:id` | Required | teacher | Update attendance |
| `GET` | `/attendance/class/:classId` | Required | admin, teacher | Get attendance by class |
| `GET` | `/attendance/student/:studentId` | Required | admin, teacher, parent, student | Get attendance by student |
| `GET` | `/attendance/report` | Required | admin, teacher | Attendance reports |
| `GET` | `/attendance/statistics` | Required | admin | Attendance statistics |

#### 5.3.9 Exams (`/api/v1/exams`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/exams` | Required | admin, teacher | List exams |
| `GET` | `/exams/:id` | Required | admin, teacher, student | Get exam details |
| `POST` | `/exams` | Required | admin, teacher | Create exam |
| `PATCH` | `/exams/:id` | Required | admin, teacher | Update exam |
| `DELETE` | `/exams/:id` | Required | admin | Delete exam |
| `GET` | `/exams/course/:courseId` | Required | admin, teacher, student | Get exams by course |
| `GET` | `/exams/upcoming` | Required | student, parent | Get upcoming exams |
| `POST` | `/exams/:id/submit` | Required | student | Submit exam answers |

#### 5.3.10 Results (`/api/v1/results`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/results` | Required | admin, teacher | List results |
| `GET` | `/results/:id` | Required | admin, teacher, student, parent | Get result details |
| `POST` | `/results` | Required | teacher | Create result |
| `POST` | `/results/bulk` | Required | teacher | Bulk upload results |
| `PATCH` | `/results/:id` | Required | teacher | Update result |
| `GET` | `/results/exam/:examId` | Required | admin, teacher | Get results by exam |
| `GET` | `/results/student/:studentId` | Required | student, parent, admin | Get results by student |
| `GET` | `/results/course/:courseId` | Required | admin, teacher | Get results by course |
| `POST` | `/results/:id/publish` | Required | admin, teacher | Publish result |
| `GET` | `/results/statistics` | Required | admin | Result statistics |
| `GET` | `/results/transcript/:studentId` | Required | student, parent, admin | Generate transcript |

#### 5.3.11 Assignments (`/api/v1/assignments`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/assignments` | Required | admin, teacher, student | List assignments |
| `GET` | `/assignments/:id` | Required | admin, teacher, student | Get assignment details |
| `POST` | `/assignments` | Required | teacher | Create assignment |
| `PATCH` | `/assignments/:id` | Required | teacher | Update assignment |
| `DELETE` | `/assignments/:id` | Required | teacher | Delete assignment |
| `GET` | `/assignments/course/:courseId` | Required | teacher, student | Get assignments by course |
| `POST` | `/assignments/:id/submit` | Required | student | Submit assignment |
| `GET` | `/assignments/:id/submissions` | Required | teacher | Get submissions |
| `PATCH` | `/assignments/:assignmentId/grade/:submissionId` | Required | teacher | Grade submission |

#### 5.3.12 Payments (`/api/v1/payments`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/payments` | Required | admin | List payments |
| `GET` | `/payments/:id` | Required | admin, parent, student | Get payment details |
| `POST` | `/payments` | Required | admin | Record payment |
| `PATCH` | `/payments/:id` | Required | admin | Update payment |
| `DELETE` | `/payments/:id` | Required | admin | Delete payment |
| `GET` | `/payments/student/:studentId` | Required | admin, parent, student | Get student payments |
| `POST` | `/payments/:id/refund` | Required | admin | Refund payment |
| `GET` | `/payments/report` | Required | admin | Payment reports |
| `GET` | `/payments/invoice/:id` | Required | admin, parent | Generate invoice PDF |
| `GET` | `/payments/dashboard` | Required | admin | Payment dashboard stats |

#### 5.3.13 Certificates (`/api/v1/certificates`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/certificates` | Required | admin | List certificates |
| `GET` | `/certificates/:id` | Required | admin, student, parent | Get certificate |
| `POST` | `/certificates` | Required | admin | Generate certificate |
| `POST` | `/certificates/bulk` | Required | admin | Bulk generate certificates |
| `DELETE` | `/certificates/:id` | Required | admin | Delete certificate |
| `GET` | `/certificates/student/:studentId` | Required | admin, student, parent | Get student certificates |
| `GET` | `/certificates/verify/:certificateNumber` | None | public | Verify certificate authenticity |
| `GET` | `/certificates/download/:id` | Required | admin, student, parent | Download certificate PDF |
| `GET` | `/certificates/templates` | Required | admin | List certificate templates |

#### 5.3.14 Announcements (`/api/v1/announcements`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/announcements` | Required | all | List announcements |
| `GET` | `/announcements/:id` | Required | all | Get announcement |
| `POST` | `/announcements` | Required | admin, teacher | Create announcement |
| `PATCH` | `/announcements/:id` | Required | admin, teacher | Update announcement |
| `DELETE` | `/announcements/:id` | Required | admin | Delete announcement |
| `GET` | `/announcements/active` | Required | all | Get active announcements |
| `PATCH` | `/announcements/:id/toggle` | Required | admin | Toggle active status |

#### 5.3.15 News (`/api/v1/news`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/news` | None | public | List published news (public) |
| `GET` | `/news/admin` | Required | admin | List all news (admin) |
| `GET` | `/news/:slug` | None | public | Get news article |
| `GET` | `/news/:id/admin` | Required | admin | Get news article (admin) |
| `POST` | `/news` | Required | admin | Create news |
| `PATCH` | `/news/:id` | Required | admin | Update news |
| `DELETE` | `/news/:id` | Required | admin | Delete news |
| `PATCH` | `/news/:id/publish` | Required | admin | Publish news |
| `PATCH` | `/news/:id/archive` | Required | admin | Archive news |
| `GET` | `/news/featured` | None | public | Get featured news |
| `GET` | `/news/tags/:tag` | None | public | Get news by tag |

#### 5.3.16 Events (`/api/v1/events`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/events` | None | public | List published events (public) |
| `GET` | `/events/admin` | Required | admin | List all events (admin) |
| `GET` | `/events/:slug` | None | public | Get event details |
| `GET` | `/events/:id/admin` | Required | admin | Get event details (admin) |
| `POST` | `/events` | Required | admin | Create event |
| `PATCH` | `/events/:id` | Required | admin | Update event |
| `DELETE` | `/events/:id` | Required | admin | Delete event |
| `GET` | `/events/upcoming` | None | public | Get upcoming events |
| `GET` | `/events/past` | None | public | Get past events |
| `GET` | `/events/calendar` | None | public | Get events calendar data |
| `POST` | `/events/:id/register` | Required | all | Register for event |
| `PATCH` | `/events/:id/cancel` | Required | admin | Cancel event |

#### 5.3.17 Gallery (`/api/v1/gallery`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/gallery` | None | public | List published albums |
| `GET` | `/gallery/admin` | Required | admin | List all albums (admin) |
| `GET` | `/gallery/:slug` | None | public | Get album with items |
| `POST` | `/gallery` | Required | admin | Create album |
| `PATCH` | `/gallery/:id` | Required | admin | Update album |
| `DELETE` | `/gallery/:id` | Required | admin | Delete album |
| `POST` | `/gallery/:id/upload` | Required | admin | Upload images to album |
| `DELETE` | `/gallery/:albumId/item/:itemId` | Required | admin | Delete item from album |
| `PATCH` | `/gallery/:albumId/reorder` | Required | admin | Reorder items |
| `PATCH` | `/gallery/:id/publish` | Required | admin | Toggle publish status |

#### 5.3.18 Messages (`/api/v1/messages`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/messages` | Required | all | List user messages |
| `GET` | `/messages/:id` | Required | all | Get message |
| `POST` | `/messages` | Required | all | Send message |
| `PATCH` | `/messages/:id/read` | Required | all | Mark as read |
| `PATCH` | `/messages/read-all` | Required | all | Mark all as read |
| `DELETE` | `/messages/:id` | Required | all | Delete message |
| `GET` | `/messages/conversations` | Required | all | List conversations |
| `GET` | `/messages/conversation/:conversationId` | Required | all | Get conversation messages |
| `GET` | `/messages/unread-count` | Required | all | Get unread count |

#### 5.3.19 Notifications (`/api/v1/notifications`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/notifications` | Required | all | List notifications |
| `GET` | `/notifications/:id` | Required | all | Get notification |
| `PATCH` | `/notifications/:id/read` | Required | all | Mark as read |
| `PATCH` | `/notifications/read-all` | Required | all | Mark all as read |
| `DELETE` | `/notifications/:id` | Required | all | Delete notification |
| `GET` | `/notifications/unread-count` | Required | all | Get unread count |
| `POST` | `/notifications` | Required | admin | Send notification to users |
| `POST` | `/notifications/broadcast` | Required | admin | Broadcast to all users |

#### 5.3.20 Roles & Permissions (`/api/v1/roles`, `/api/v1/permissions`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/roles` | Required | admin | List roles |
| `GET` | `/roles/:id` | Required | admin | Get role |
| `POST` | `/roles` | Required | admin | Create role |
| `PATCH` | `/roles/:id` | Required | admin | Update role |
| `DELETE` | `/roles/:id` | Required | admin | Delete role (non-system) |
| `GET` | `/permissions` | Required | admin | List permissions |
| `GET` | `/permissions/modules` | Required | admin | List permission modules |
| `POST` | `/permissions` | Required | admin | Create permission |

#### 5.3.21 Settings (`/api/v1/settings`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/settings` | Required | admin | List all settings |
| `GET` | `/settings/:group` | Required | admin | Get settings by group |
| `PATCH` | `/settings/:id` | Required | admin | Update setting |
| `PATCH` | `/settings/bulk` | Required | admin | Bulk update settings |
| `GET` | `/settings/public` | None | public | Get public settings |
| `POST` | `/settings/upload-logo` | Required | admin | Upload website logo |
| `POST` | `/settings/upload-favicon` | Required | admin | Upload favicon |

#### 5.3.22 Donations (`/api/v1/donations`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/donations` | Required | admin | List donations |
| `GET` | `/donations/:id` | Required | admin | Get donation |
| `POST` | `/donations` | None | public | Create donation |
| `PATCH` | `/donations/:id` | Required | admin | Update donation |
| `GET` | `/donations/report` | Required | admin | Donation reports |
| `GET` | `/donations/stats` | Required | admin | Donation statistics |
| `POST` | `/donations/:id/receipt` | Required | admin | Send receipt |

#### 5.3.23 Upload (`/api/v1/upload`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/upload/image` | Required | all | Upload image |
| `POST` | `/upload/document` | Required | all | Upload document |
| `POST` | `/upload/video` | Required | admin | Upload video |
| `POST` | `/upload/multiple` | Required | admin | Upload multiple files |
| `DELETE` | `/upload/:fileId` | Required | admin | Delete file |

#### 5.3.24 Analytics (`/api/v1/analytics`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/analytics/dashboard` | Required | admin | Dashboard analytics |
| `GET` | `/analytics/students` | Required | admin | Student analytics |
| `GET` | `/analytics/courses` | Required | admin | Course analytics |
| `GET` | `/analytics/finance` | Required | admin | Financial analytics |
| `GET` | `/analytics/attendance` | Required | admin | Attendance analytics |
| `GET` | `/analytics/performance` | Required | admin | Academic performance analytics |
| `GET` | `/analytics/exports` | Required | admin | Export analytics data |

#### 5.3.25 Website (Public) (`/api/v1/website`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/website/hero` | None | public | Hero section data |
| `GET` | `/website/about` | None | public | About section data |
| `GET` | `/website/programs` | None | public | Programs data |
| `GET` | `/website/teachers` | None | public | Featured teachers |
| `GET` | `/website/achievements` | None | public | Achievements/stats |
| `GET` | `/website/testimonials` | None | public | Testimonials |
| `GET` | `/website/contact` | None | public | Contact information |
| `POST` | `/website/contact` | None | public | Submit contact form |
| `POST` | `/website/newsletter` | None | public | Subscribe to newsletter |

#### 5.3.26 Logs (`/api/v1/logs`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/logs` | Required | admin | List logs (paginated, filterable) |
| `GET` | `/logs/:id` | Required | admin | Get log details |
| `GET` | `/logs/export` | Required | admin | Export logs |
| `DELETE` | `/logs` | Required | admin | Clear old logs |

### 5.4 API Statistics

| Category | Endpoint Count |
|---|---|
| Authentication | 11 |
| Users | 7 |
| Students | 12 |
| Parents | 7 |
| Teachers | 7 |
| Courses | 11 |
| Classes | 7 |
| Attendance | 8 |
| Exams | 8 |
| Results | 11 |
| Assignments | 8 |
| Payments | 10 |
| Certificates | 9 |
| Announcements | 7 |
| News | 11 |
| Events | 11 |
| Gallery | 9 |
| Messages | 9 |
| Notifications | 8 |
| Roles & Permissions | 8 |
| Settings | 7 |
| Donations | 7 |
| Upload | 5 |
| Analytics | 7 |
| Website (Public) | 10 |
| Logs | 4 |
| **Total** | **~218 endpoints** |

---

## 6. User Flow Diagrams

### 6.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION FLOW                          │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────┐
     │  Landing │
     │   Page   │
     └────┬─────┘
          │ User clicks "Login"
          ▼
     ┌──────────┐
     │  Login   │──── Forgot Password? ────┐
     │   Page   │                          │
     └────┬─────┘                          ▼
          │                          ┌──────────────┐
          │ Valid credentials?       │ Forgot       │
          │                          │ Password     │
     ┌────┴────┐                     │ Page         │
     │   Yes   │   No ──► Error      └──────┬───────┘
     └────┬────┘                            │ Email sent
          │                                 ▼
          ▼                          ┌──────────────┐
   ┌──────────────┐                  │ Check Email  │
   │ Generate JWT │                  │ & Click Link │
   │ Access Token │                  └──────┬───────┘
   │ (15 min)     │                         │
   │ Refresh Token│                         ▼
   │ (7 days)     │                  ┌──────────────┐
   └──────┬───────┘                  │ Reset        │
          │                          │ Password     │
          ▼                          │ Page         │
   ┌──────────────┐                  └──────┬───────┘
   │ Redirect to  │                         │
   │ Role-based   │                         ▼
   │ Dashboard    │                  ┌──────────────┐
   └──────────────┘                  │ Password     │
                                     │ Reset        │
    ┌────────────┐                   │ Success      │
    │   Admin    │────► /admin       └──────┬───────┘
    │ Dashboard  │                         │
    └────────────┘                         ▼
                                  ┌──────────────┐
    ┌────────────┐                │ Redirect to  │
    │  Student   │───► /student   │ Login Page   │
    │ Dashboard  │                └──────────────┘
    └────────────┘
    ┌────────────┐
    │  Parent    │───► /parent
    │ Dashboard  │
    └────────────┘
    ┌────────────┐
    │  Teacher   │───► /teacher
    │ Dashboard  │
    └────────────┘

    Token Refresh Flow:
    ┌──────────────────────────────────────────────┐
    │  Access Token Expired (15 min)                │
    │       │                                       │
    │       ▼                                       │
    │  Interceptor catches 401                     │
    │       │                                       │
    │       ▼                                       │
    │  POST /auth/refresh-token                     │
    │  (sends refresh token in httpOnly cookie)     │
    │       │                                       │
    │  ┌────┴────┐                                  │
    │  │ Valid?  │── No ──► Redirect to Login       │
    │  └────┬────┘                                  │
    │       │ Yes                                   │
    │       ▼                                       │
    │  New Access Token issued                      │
    │  Original request retried                     │
    └──────────────────────────────────────────────┘
```

### 6.2 Student Enrollment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STUDENT ENROLLMENT FLOW                        │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ Admin Portal │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Create User  │──► Email sent with credentials
     │ (role:student)│
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Create       │
     │ Student      │──► Assign parent (optional)
     │ Profile      │──► Generate Student ID
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Enroll in    │──► Select course(s)
     │ Courses      │──► Check capacity
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Record       │──► Registration fee
     │ Payment      │──► Generate receipt
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Student      │──► Email verification
     │ Active       │──► Login credentials
     └──────────────┘
```

### 6.3 Exam & Grading Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      EXAM & GRADING FLOW                         │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ Teacher/Admin│
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Create Exam  │──► Set title, type, marks, date
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Schedule     │──► Set date/time
     │ Exam         │──► Notify students
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Exam Day     │──► Online (submit answers)
     │              │──► Offline (teacher marks manually)
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Grade Exam   │──► Enter marks
     │              │──► Calculate percentage
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Review       │──► Teacher reviews
     │ Results      │──► Admin approves
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Publish      │──► Results visible to students/parents
     │ Results      │──► Notifications sent
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Generate     │──► Certificate (if course completed)
     │ Certificate  │──► Transcript (on request)
     └──────────────┘
```

### 6.4 Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        PAYMENT FLOW                              │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ Admin Portal │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Create       │──► Select student
     │ Payment      │──► Enter amount, type, due date
     │ Record       │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Payment      │──► Student/Parent notified
     │ Pending      │──► Invoice available
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Payment      │──► Admin records payment
     │ Received     │──► Cash/Bank/Mobile Money/Online
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Payment      │──► Receipt generated
     │ Completed    │──► Receipt emailed (optional)
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Dashboard    │──► Revenue reports
     │ Updated      │──► Student account updated
     └──────────────┘
```

---

## 7. ER Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MASJID AL-RAHMA — ENTITY RELATIONSHIP DIAGRAM            │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐         ┌───────────┐         ┌──────────┐
    │   Role   │ 1─────N │  User     │ 1─────1 │  Profile │
    └──────────┘         └─────┬─────┘         └──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                1│            1│            1│
                 │             │             │
           ┌─────▼─────┐ ┌────▼────┐  ┌─────▼─────┐
           │  Student  │ │ Teacher │  │   Parent  │
           └─────┬─────┘ └────┬────┘  └─────┬─────┘
                 │             │             │
                 │             │             │
      ┌──────────┼──────────┐  │    ┌────────┼────────┐
      │          │          │  │    │        │        │
      │N         │N         │N │    │1       │N       │N
      │          │          │  │    │        │        │
 ┌────▼────┐ ┌───▼───┐ ┌───▼──▼──┐│┌───▼───┐ ┌──▼──┐
 │Attendance│ │Results│ │Enrollment│││ Child │ │Fee  │
 └────┬─────┘ └───┬───┘ └────┬────┘│└───────┘ └─────┘
      │           │           │     │
      │N          │N          │N    │
      │           │           │     │
 ┌────▼────┐ ┌───▼───┐  ┌───▼─────▼──┐
 │  Class  │ │  Exam │  │   Course   │◄────────────┐
 └────┬────┘ └───┬───┘  └─────┬──────┘              │
      │           │            │                     │
      │N          │N           │1                    │
      │           │            │                     │
      └─────┬─────┘            │                     │
            │                  │                     │
            │                  │                     │
       ┌────▼────┐             │               ┌────┴──────┐
       │  Class  │             │               │ Assignment│
       │ Schedule│             │               └─────┬─────┘
       └─────────┘             │                     │
                               │                     │N
                               │                     │
                         ┌─────▼─────┐         ┌─────▼─────┐
                         │  Teacher  │         │ Submission │
                         └───────────┘         └───────────┘


    ┌────────────┐      ┌────────────┐      ┌─────────────┐
    │   Payment  │      │Certificate │      │  Donation   │
    └──────┬─────┘      └─────┬──────┘      └──────┬──────┘
           │                  │                    │
           │N                 │N                   │
           │                  │                    │
      ┌────▼────┐       ┌────▼────┐         ┌─────▼─────┐
      │ Student │       │ Student │         │ Donor/User│
      └─────────┘       └─────────┘         └───────────┘


    ┌────────────┐      ┌────────────┐      ┌─────────────┐
    │   Message  │      │Notification│      │     Log     │
    └──────┬─────┘      └─────┬──────┘      └──────┬──────┘
           │                  │                    │
           │N                 │N                   │N (nullable)
           │                  │                    │
      ┌────▼────┐       ┌────▼────┐         ┌─────▼─────┐
      │   User  │       │   User  │         │    User   │
      └─────────┘       └─────────┘         └───────────┘


    ┌────────────┐      ┌────────────┐      ┌─────────────┐
    │   News     │      │   Event    │      │   Gallery   │
    └──────┬─────┘      └─────┬──────┘      └──────┬──────┘
           │                  │                    │
           │1                 │1                   │1
           │                  │                    │
      ┌────▼────┐       ┌────▼────┐         ┌─────▼─────┐
      │   User  │       │   User  │         │    User   │
      │(Author) │       │(Creator)│         │ (Uploader)│
      └─────────┘       └─────────┘         └───────────┘


    ┌────────────┐      ┌────────────┐
    │Announcement│      │  Settings  │
    └──────┬─────┘      └───────────┘
           │              (Key-Value)
           │1
           │
      ┌────▼────┐
      │   User  │
      │(Creator)│
      └─────────┘

    ┌────────────┐      ┌──────────────┐
    │ Permission │      │    Role      │
    └────────────┘      └──────┬───────┘
                               │
         (Permission slugs)    │N
         stored as array       │
         in Role document      │
                               │
                         ┌─────▼─────┐
                         │    User   │
                         └───────────┘


RELATIONSHIP LEGEND:

    ───     One-to-One
    ───N    One-to-Many
    N───N   Many-to-Many (via junction or array)

KEY RELATIONSHIPS:

    1. User 1:1 Profile         — Each user has one profile
    2. User 1:1 Student         — Each user can be one student
    3. User 1:1 Teacher         — Each user can be one teacher
    4. User 1:1 Parent          — Each user can be one parent
    5. Student N:1 Parent       — Multiple students can have one parent
    6. Student N:M Course       — Students enrolled in many courses
    7. Teacher 1:N Course       — Teacher assigned to many courses
    8. Course 1:N Class         — Course has many class sessions
    9. Course 1:N Exam          — Course has many exams
   10. Course 1:N Assignment    — Course has many assignments
   11. Student 1:N Attendance   — Student has many attendance records
   12. Student 1:N Result       — Student has many results
   13. Student 1:N Payment      — Student has many payments
   14. Student 1:N Certificate  — Student has many certificates
   15. User 1:N Message         — User sends/receives many messages
   16. User 1:N Notification    — User receives many notifications
   17. Role N:M Permission      — Role has many permissions (stored as array of slugs)
   18. Event 1:1 Gallery        — Event may have one gallery (optional)
```

---

## 8. Feature List

### 8.1 Public Website (Landing Page)

| # | Feature | Priority | Status |
|---|---|---|---|
| 1 | Hero Section with animated Islamic calligraphy | P0 | Planned |
| 2 | About Masjid Al-Rahma Section | P0 | Planned |
| 3 | Programs Overview (Quran, Fiqh, Arabic, etc.) | P0 | Planned |
| 4 | Courses Showcase with filtering | P0 | Planned |
| 5 | Teachers/Staff Showcase | P1 | Planned |
| 6 | Achievements & Milestones Counter | P1 | Planned |
| 7 | Student Statistics Dashboard (Public) | P1 | Planned |
| 8 | Upcoming Events with Calendar | P0 | Planned |
| 9 | Latest News & Blog | P1 | Planned |
| 10 | Photo/Video Gallery with Lightbox | P1 | Planned |
| 11 | Testimonials Carousel | P1 | Planned |
| 12 | Donation Section (One-time, Monthly, Zakat, Sadaqah) | P0 | Planned |
| 13 | Contact Form with Google reCAPTCHA | P0 | Planned |
| 14 | Google Maps Integration | P0 | Planned |
| 15 | Newsletter Subscription | P2 | Planned |
| 16 | Footer with Quick Links & Social Media | P0 | Planned |
| 17 | Dark Mode Toggle | P1 | Planned |
| 18 | Multi-language Switcher (EN/SO/AR) | P0 | Planned |
| 19 | Prayer Times Widget | P2 | Planned |
| 20 | Live Stream Embed (Jummah/Events) | P2 | Planned |
| 21 | SEO Optimized (Meta tags, OG, Schema.org) | P0 | Planned |
| 22 | Fast Loading (Lazy loading, Image optimization) | P0 | Planned |

### 8.2 Admin Portal

| # | Module | Features | Priority |
|---|---|---|---|
| 1 | **Dashboard** | Overview stats, charts, recent activity, quick actions | P0 |
| 2 | **Student Management** | CRUD, bulk import/export, search, filter, status management | P0 |
| 3 | **Parent Management** | CRUD, link children, view children data | P0 |
| 4 | **Teacher Management** | CRUD, assign courses, view schedule, qualifications | P0 |
| 5 | **Course Management** | CRUD, syllabus builder, enrollment, capacity management | P0 |
| 6 | **Class Management** | Schedule builder, recurring classes, room assignment | P0 |
| 7 | **Attendance** | Mark attendance, bulk mark, reports, statistics, export | P0 |
| 8 | **Exam Management** | Create exams, set questions, schedule, online/offline modes | P1 |
| 9 | **Result Management** | Grade entry, bulk upload, publish, GPA calculation, transcripts | P0 |
| 10 | **Payment Management** | Record payments, invoices, receipts, reports, refunds | P0 |
| 11 | **Certificate Management** | Generate, bulk generate, templates, verify | P1 |
| 12 | **Announcements** | Create, target roles, schedule, notifications | P1 |
| 13 | **News Management** | CRUD articles, publish, categories, featured | P1 |
| 14 | **Event Management** | CRUD events, registration, calendar | P1 |
| 15 | **Gallery Management** | Albums, upload, organize, publish | P2 |
| 16 | **Role Management** | CRUD roles, assign permissions | P0 |
| 17 | **Permission Management** | Module-based permissions, granular actions | P0 |
| 18 | **System Settings** | General, website, email, payment, academic settings | P0 |
| 19 | **Analytics** | Student analytics, financial, attendance, performance | P1 |
| 20 | **Activity Logs** | Audit trail, filter, export, retention | P1 |
| 21 | **Profile Management** | Update own profile, change password | P0 |
| 22 | **Notifications** | Send notifications to users/groups | P1 |
| 23 | **Messaging** | Internal messaging with teachers/parents/students | P2 |

### 8.3 Student Portal

| # | Feature | Priority |
|---|---|---|
| 1 | Dashboard with summary (courses, attendance %, upcoming exams) | P0 |
| 2 | My Courses — view enrolled courses with progress | P0 |
| 3 | Course Materials — view syllabus, resources, downloads | P0 |
| 4 | My Attendance — view attendance history and percentage | P0 |
| 5 | My Exams — view upcoming and past exams | P0 |
| 6 | My Results — view grades, GPA, transcripts | P0 |
| 7 | Assignments — view, submit, check grades | P1 |
| 8 | Downloads — access course materials, notes, resources | P1 |
| 9 | My Certificates — view and download earned certificates | P1 |
| 10 | Notifications — receive and manage notifications | P0 |
| 11 | Messages — communicate with teachers and admin | P1 |
| 12 | Profile — view and edit profile | P0 |
| 13 | Settings — language, theme, password change | P0 |
| 14 | Payment History — view fee status and receipts | P1 |
| 15 | Calendar — view class schedule and events | P2 |

### 8.4 Parent Portal

| # | Feature | Priority |
|---|---|---|
| 1 | Dashboard with children summary | P0 |
| 2 | Children Management — view linked children profiles | P0 |
| 3 | Attendance — view each child's attendance | P0 |
| 4 | Results — view each child's grades and progress | P0 |
| 5 | Fees — view fee status, payment history, invoices | P0 |
| 6 | Notifications — receive school notifications | P0 |
| 7 | Messages — communicate with teachers and admin | P1 |
| 8 | Profile — view and edit profile | P0 |
| 9 | Settings — language, theme, password change | P0 |
| 10 | Event Calendar — view school events | P2 |

---

## 9. Development Roadmap

### Phase 0: Foundation (Week 1-2)
- [ ] Initialize monorepo with Turborepo
- [ ] Set up frontend (Vite + React + Tailwind + Shadcn)
- [ ] Set up backend (Express + MongoDB + Mongoose)
- [ ] Set up ESLint, Prettier, TypeScript configs
- [ ] Set up Git workflow and CI/CD
- [ ] Design system tokens (colors, typography, spacing)
- [ ] i18n framework setup (react-i18next + backend i18n)
- [ ] Database connection and configuration
- [ ] Docker Compose for local development
- [ ] API response standardization

### Phase 1: Authentication & Core (Week 3-4)
- [ ] User Model + Profile Model
- [ ] JWT Authentication (access + refresh tokens)
- [ ] bcrypt password hashing
- [ ] Registration flow
- [ ] Login flow
- [ ] Email verification
- [ ] Forgot/Reset password
- [ ] Role-based middleware
- [ ] Permission-based middleware
- [ ] Validation middleware (Joi)
- [ ] Error handling middleware
- [ ] Security middleware (Helmet, CORS, Rate Limiting)
- [ ] Frontend auth pages (Login, Register, Forgot, Reset)
- [ ] Auth context and protected routes

### Phase 2: Dashboard & Layouts (Week 5-6)
- [ ] Admin Layout (Sidebar, Header, Content Area)
- [ ] Student Layout
- [ ] Parent Layout
- [ ] Public Layout
- [ ] Dashboard widgets (StatCards, Charts, Tables)
- [ ] Role-based navigation
- [ ] Breadcrumb navigation
- [ ] Dark mode implementation
- [ ] Language switcher
- [ ] Responsive layouts (mobile-first)

### Phase 3: Core Modules (Week 7-10)
- [ ] Student Management (CRUD, Import/Export)
- [ ] Teacher Management (CRUD)
- [ ] Parent Management (CRUD, Child linking)
- [ ] Course Management (CRUD, Syllabus)
- [ ] Class Management (Schedule)
- [ ] Attendance Module
- [ ] Exam Module
- [ ] Result Module
- [ ] Payment Module

### Phase 4: Extended Modules (Week 11-13)
- [ ] Assignment Module
- [ ] Certificate Module
- [ ] Announcement Module
- [ ] News Module
- [ ] Event Module
- [ ] Gallery Module
- [ ] Role & Permission Management
- [ ] System Settings

### Phase 5: Public Website (Week 14-16)
- [ ] Hero Section
- [ ] About Section
- [ ] Programs Section
- [ ] Courses Section
- [ ] Teachers Section
- [ ] Achievements Section
- [ ] Events Section
- [ ] News Section
- [ ] Gallery Section
- [ ] Testimonials Section
- [ ] Donation Section
- [ ] Contact Section
- [ ] Google Maps
- [ ] Footer
- [ ] Animations (Framer Motion)
- [ ] SEO optimization

### Phase 6: Advanced Features (Week 17-19)
- [ ] Internal Messaging System
- [ ] Notification System
- [ ] Analytics Dashboard
- [ ] Activity Logging
- [ ] Bulk operations
- [ ] Export (CSV, Excel, PDF)
- [ ] Report Generation
- [ ] Background Jobs (Bull + Redis)
- [ ] Email Templates
- [ ] PDF Generation (Certificates, Invoices, Transcripts)

### Phase 7: Testing & QA (Week 20-21)
- [ ] Unit Tests (Backend Services)
- [ ] Integration Tests (API)
- [ ] Frontend Component Tests
- [ ] E2E Tests (Critical paths)
- [ ] Performance Testing
- [ ] Security Audit
- [ ] Accessibility Audit (WCAG 2.1)
- [ ] Cross-browser Testing
- [ ] Mobile Responsiveness Testing

### Phase 8: Deployment & Launch (Week 22-24)
- [ ] Backend deployment to Hostinger VPS via Coolify
- [ ] MongoDB Atlas cluster provisioning
- [ ] Frontend deployment to Vercel
- [ ] CDN configuration
- [ ] SSL certificate setup
- [ ] Domain configuration
- [ ] Environment variables management
- [ ] Database seeding
- [ ] Monitoring setup (Uptime, Logging, Alerts)
- [ ] Backup strategy implementation
- [ ] Documentation
- [ ] User training materials
- [ ] Soft launch (Beta)
- [ ] Bug fixes from beta
- [ ] Production launch

---

## 10. Folder Naming Convention

### 10.1 General Rules

| Rule | Convention | Example |
|---|---|---|
| **Directories** | kebab-case | `rich-text-editor/`, `auth-service/` |
| **React Components** | PascalCase (file matches component name) | `LoginForm.tsx`, `StatCard.tsx` |
| **React Pages** | kebab-case for directories, PascalCase for files | `students/list.tsx`, `students/create.tsx` |
| **Hooks** | camelCase, prefixed with `use` | `useAuth.ts`, `useDebounce.ts` |
| **Services** | camelCase, suffixed with `.service` | `auth.service.ts`, `course.service.ts` |
| **Utilities** | camelCase | `formatters.ts`, `validators.ts` |
| **Types** | camelCase, suffixed with `.types` | `auth.types.ts`, `user.types.ts` |
| **Constants** | SCREAMING_SNAKE_CASE for values, camelCase for files | `ROLES.ts`, `permissions.ts` |
| **Models** | PascalCase, suffixed with `.model` | `User.model.ts`, `Course.model.ts` |
| **Repositories** | camelCase, suffixed with `.repository` | `user.repository.ts` |
| **Services (Backend)** | camelCase, suffixed with `.service` | `auth.service.ts` |
| **Controllers** | camelCase, suffixed with `.controller` | `auth.controller.ts` |
| **Routes** | camelCase, suffixed with `.routes` | `auth.routes.ts` |
| **Middleware** | camelCase, suffixed with `.middleware` | `auth.middleware.ts` |
| **Validators** | camelCase, suffixed with `.validator` | `auth.validator.ts` |
| **i18n Namespaces** | camelCase JSON files | `common.json`, `landing.json` |
| **Environment Files** | `.env.{environment}` | `.env.development`, `.env.production` |
| **Test Files** | Same name as source + `.test` or `.spec` | `auth.service.test.ts` |
| **Config Files** | dotfiles or kebab-case | `.eslintrc.cjs`, `tailwind.config.ts` |

### 10.2 Route Naming Convention

| Portal | Route Pattern | Example |
|---|---|---|
| Public | `/{section}` | `/courses`, `/events`, `/news/quran-classes-2026` |
| Auth | `/auth/{action}` | `/auth/login`, `/auth/register`, `/auth/forgot-password` |
| Admin | `/admin/{module}/{action}/{id?}` | `/admin/students`, `/admin/students/create`, `/admin/students/123/edit` |
| Student | `/student/{module}` | `/student/courses`, `/student/results`, `/student/attendance` |
| Parent | `/parent/{module}` | `/parent/children`, `/parent/results`, `/parent/fees` |

### 10.3 API Route Naming Convention

| Pattern | Example |
|---|---|
| `/api/v1/{resource}` (plural, kebab-case if compound) | `/api/v1/students`, `/api/v1/refresh-tokens` |
| `/api/v1/{resource}/:id` | `/api/v1/students/:id` |
| `/api/v1/{resource}/:id/{sub-resource}` | `/api/v1/courses/:id/students` |
| `/api/v1/{resource}/{action}` | `/api/v1/students/bulk-import` |

---

## 11. Coding Standards

### 11.1 TypeScript

- Use **strict mode** in `tsconfig.json`
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and mapped types
- Avoid `any` — use `unknown` and type guards
- Use `readonly` for immutable properties
- Use `as const` for literal types
- Export types from dedicated `.types.ts` files
- Use `Pick`, `Omit`, `Partial`, `Required` utility types
- Document complex types with JSDoc comments

### 11.2 React

- Functional components only (no class components)
- Use named exports (avoid default exports except for pages)
- One component per file
- Use React Hook Form for all forms
- Use Zod for client-side validation
- Use TanStack Query for all server state
- Use React Context for global state (auth, theme, i18n)
- Avoid prop drilling — compose contexts or use composition
- Use `React.memo` only when profiler shows benefit
- Use `useCallback` and `useMemo` only for referential stability or expensive computations
- Clean up side effects in `useEffect` return
- Use `Suspense` and `ErrorBoundary` for async components

### 11.3 Express.js

- Single responsibility per controller method
- Business logic in services, never in controllers
- Data access in repositories, never in services
- Use `async/await` with try-catch (or async handler wrapper)
- Always return standardized API responses
- Use HTTP status codes correctly:
  - `200` GET success
  - `201` POST created
  - `204` DELETE success
  - `400` Validation error
  - `401` Unauthorized
  - `403` Forbidden
  - `404` Not found
  - `409` Conflict
  - `422` Unprocessable entity
  - `429` Too many requests
  - `500` Internal server error
- Always validate input (Joi middleware)
- Always sanitize input (express-mongo-sanitize)
- Always authorize (auth + role middleware)
- Use proper HTTP methods (GET, POST, PATCH, DELETE)
- Don't use POST for updates, use PATCH
- Don't use POST for deletion, use DELETE

### 11.4 MongoDB/Mongoose

- Use Mongoose schemas with validation
- Define indexes explicitly in schemas
- Use `lean()` for read-only queries
- Use `.select()` to limit fields returned
- Use `.populate()` judiciously (avoid deep nesting)
- Use aggregation pipelines for complex queries
- Use `session` for transactions when needed
- Use soft delete pattern (add `deletedAt` field)
- Use `timestamps: true` on all schemas
- Use `versionKey: false` unless needed
- Use `toJSON` transform to control output

### 11.5 Git

- Branch naming: `feature/{module}-{description}`, `bugfix/{description}`, `hotfix/{description}`
- Commit message format: `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
  - Example: `feat(auth): add refresh token rotation`
- Never commit to `main` directly
- Squash commits before merging
- PR title should follow commit convention
- PR description should include: What, Why, How, Testing, Screenshots

### 11.6 Code Quality

- **SOLID Principles:**
  - S: Single Responsibility — each module/class/function does one thing
  - O: Open/Closed — open for extension, closed for modification
  - L: Liskov Substitution — subtypes must be substitutable
  - I: Interface Segregation — many specific interfaces > one general
  - D: Dependency Inversion — depend on abstractions, not concretions
- **DRY (Don't Repeat Yourself):** Extract repeated logic into utilities/hooks/services
- **KISS (Keep It Simple, Stupid):** Prefer readability over cleverness
- **YAGNI (You Ain't Gonna Need It):** Don't build for hypothetical future needs
- Max function length: 50 lines
- Max file length: 300 lines (excluding generated code)
- Max parameter count: 4 (use options object beyond that)
- Cyclomatic complexity: ≤ 10 per function
- No magic numbers — use named constants
- No commented-out code — use Git history
- No `console.log` in production — use logger

### 11.7 Security

- Never store secrets in code — use environment variables
- Never expose stack traces in production errors
- Hash all passwords (bcrypt, 12 rounds)
- Use parameterized queries (Mongoose does this natively)
- Validate file uploads (type, size, malware scan)
- Use `helmet` for security headers
- Use `cors` with whitelist
- Use `express-rate-limit` for brute force protection
- Use `express-mongo-sanitize` for NoSQL injection
- Use `xss-clean` for XSS protection
- Use CSRF tokens for state-changing operations
- Use `httpOnly` cookies for refresh tokens
- Use short-lived access tokens (15 min)
- Rotate refresh tokens on use
- Implement proper logout (invalidate refresh token)

### 11.8 Performance

- Optimize MongoDB queries with proper indexes
- Use Redis caching for frequently accessed data (settings, courses)
- Implement pagination on all list endpoints (default: 20 items)
- Compress responses (gzip/brotli)
- Use CDN for static assets
- Lazy load images and components
- Use React code splitting (dynamic imports per route)
- Minimize bundle size (tree shaking, code splitting)
- Use connection pooling for MongoDB
- Use cluster mode for Node.js (PM2)
- Use Bull queues for heavy operations (email, PDF generation)

---

## 12. Deployment Strategy

### 12.1 Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DOMAIN: masjidalrahma.com                     │
│                                                                      │
│  DNS: Cloudflare                                                     │
│  • DNS Management                                                    │
│  • DDoS Protection                                                   │
│  • SSL/TLS (Full Strict Mode)                                        │
│  • CDN Caching                                                       │
│  • Firewall Rules                                                    │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
        ┌───────────▼───────────┐   ┌───────────▼───────────┐
        │    app.masjidalrahma  │   │   api.masjidalrahma   │
        │       .com            │   │       .com            │
        │                       │   │                       │
        │     VERCEL            │   │   HOSTINGER VPS       │
        │   (Frontend Hosting)  │   │   (Backend Hosting)   │
        └───────────────────────┘   └───────────────────────┘
                                               │
                                    ┌───────────▼───────────┐
                                    │   MONGODB ATLAS        │
                                    │   (Database Hosting)   │
                                    └───────────────────────┘
```

### 12.2 Frontend Deployment (Vercel)

```yaml
# vercel.json
{
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "installCommand": "pnpm install",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

**Steps:**
1. Connect GitHub repository to Vercel
2. Configure build settings (framework: Vite, output: dist)
3. Add environment variables:
   - `VITE_API_URL=https://api.masjidalrahma.com/api/v1`
   - `VITE_APP_NAME=Masjid Al-Rahma`
   - `VITE_GOOGLE_MAPS_KEY=xxx`
   - `VITE_RECAPTCHA_SITE_KEY=xxx`
4. Configure custom domain: `app.masjidalrahma.com` (or `masjidalrahma.com`)
5. Enable automatic deployments on push to `main`
6. Configure preview deployments for PR branches

### 12.3 Backend Deployment (Hostinger VPS + Coolify)

**VPS Specifications (Recommended):**
- CPU: 4 vCPUs
- RAM: 8 GB
- Storage: 80 GB SSD
- Bandwidth: 4 TB
- OS: Ubuntu 22.04 LTS
- Control Panel: Coolify (self-hosted)

**Coolify Setup Steps:**
1. Provision VPS with Ubuntu 22.04
2. Install Coolify via one-line script
3. Configure Coolify:
   - Add server (localhost)
   - Add GitHub integration
   - Create new application (Node.js)
4. Configure application:
   - Build Pack: `nixpacks` (auto-detect)
   - Start Command: `node dist/server.js`
   - Port: `5000`
   - Environment Variables: (see below)
5. Configure Nginx reverse proxy (automatic via Coolify)
6. Configure SSL via Let's Encrypt (automatic via Coolify)
7. Set up health checks: `GET /api/v1/health`
8. Configure auto-deploy on push to `main`

**Coolify Docker Compose additions:**
```yaml
# Additional services in Coolify
services:
  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

**Environment Variables (.env):**
```env
# App
NODE_ENV=production
PORT=5000
APP_NAME=Masjid Al-Rahma API
APP_URL=https://api.masjidalrahma.com
CLIENT_URL=https://masjidalrahma.com

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/masjid-al-rahma?retryWrites=true&w=majority

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=<random-64-char-string>
JWT_REFRESH_SECRET=<random-64-char-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email (SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=noreply@masjidalrahma.com
SMTP_PASS=<email-password>
SMTP_FROM='"Masjid Al-Rahma" <noreply@masjidalrahma.com>'

# File Upload
UPLOAD_MAX_SIZE=10485760
UPLOAD_PATH=/app/uploads

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Google
GOOGLE_MAPS_API_KEY=<key>
RECAPTCHA_SECRET_KEY=<key>

# Logging
LOG_LEVEL=info

# Encryption
ENCRYPTION_KEY=<random-32-char-string>
```

### 12.4 MongoDB Atlas Setup

1. Create MongoDB Atlas cluster (M10 or higher for production)
2. Configure network access (VPS IP whitelist)
3. Create database user with minimum required privileges
4. Enable automated backups (daily)
5. Set backup retention to 7 days
6. Configure monitoring alerts:
   - CPU usage > 80%
   - Memory usage > 80%
   - Disk usage > 80%
   - Connection count > 80% of limit
7. Enable performance advisor
8. Create recommended indexes

### 12.5 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test

  deploy-backend:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Coolify
        run: |
          curl -X POST ${{ secrets.COOLIFY_WEBHOOK_URL }}

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Vercel
        run: |
          curl -X POST ${{ secrets.VERCEL_DEPLOY_HOOK }}
```

### 12.6 Backup Strategy

| What | Frequency | Retention | Location |
|---|---|---|---|
| MongoDB (Atlas automated) | Daily | 7 days | MongoDB Atlas |
| MongoDB (Manual dump) | Weekly | 4 weeks | Cloud Storage (S3-compatible) |
| Uploaded files | Daily (rsync) | 30 days | Cloud Storage |
| Environment configs | On change | Indefinite | Encrypted secret manager |
| Application logs | Real-time | 90 days | Log management service |

### 12.7 Monitoring & Observability

| Tool | Purpose |
|---|---|
| **Coolify** | Server health, container monitoring |
| **MongoDB Atlas Monitoring** | Database performance, alerts |
| **Sentry** | Frontend & Backend error tracking |
| **Uptime Robot** | Uptime monitoring, status page |
| **Winston + Morgan** | Application logging |
| **PM2 Metrics** | Node.js process monitoring |
| **Google Analytics** | Website traffic analytics |

---

## 13. Security Architecture

### 13.1 Defense-in-Depth Layers

```
Layer 1: Network
    ├── Cloudflare DDoS Protection
    ├── Cloudflare WAF (Web Application Firewall)
    ├── IP Whitelisting for admin access (optional)
    └── TLS 1.3 encryption

Layer 2: Application (Backend)
    ├── Helmet (Security headers)
    ├── CORS (Whitelist origins)
    ├── Rate Limiting (express-rate-limit)
    ├── Input Sanitization (express-mongo-sanitize)
    ├── XSS Protection (xss-clean)
    ├── Request Size Limiting
    └── Parameter Pollution Protection

Layer 3: Authentication
    ├── JWT Access Token (15 min TTL)
    ├── JWT Refresh Token (7 day TTL, httpOnly cookie)
    ├── Refresh Token Rotation
    ├── bcrypt Password Hashing (12 rounds)
    ├── Email Verification Required
    ├── Account Lockout after 5 failed attempts
    └── Rate Limiting on Auth Endpoints

Layer 4: Authorization
    ├── Role-Based Access Control (RBAC)
    ├── Permission-Based Access Control (PBAC)
    ├── Resource Ownership Verification
    └── API Endpoint Guard Middleware

Layer 5: Data
    ├── MongoDB Authentication (SCRAM)
    ├── MongoDB TLS Encryption
    ├── Field-Level Encryption (sensitive data)
    ├── Backup Encryption at Rest
    └── Audit Logging
```

### 13.2 Security Headers (Helmet)

```typescript
{
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.cloudinary.com", "https://maps.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.masjidalrahma.com"],
      frameSrc: ["'self'", "https://www.google.com", "https://www.youtube.com"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}
```

### 13.3 JWT Token Strategy

```
Access Token:
    - Type: JWT (signed with HS256)
    - Payload: { userId, role, permissions }
    - TTL: 15 minutes
    - Storage: In-memory (JavaScript variable) — NOT localStorage
    - Sent via: Authorization: Bearer <token>

Refresh Token:
    - Type: JWT (signed with separate secret)
    - Payload: { userId, tokenVersion }
    - TTL: 7 days
    - Storage: httpOnly, Secure, SameSite=Strict cookie
    - Rotation: New refresh token issued on each use
    - Invalidation: Old token invalidated on use (prevents replay)

Token Flow:
    1. User logs in → receives access token + refresh token (cookie)
    2. Access token expires → frontend interceptor catches 401
    3. Frontend calls POST /auth/refresh-token (cookie sent automatically)
    4. Backend validates refresh token, checks tokenVersion
    5. Backend issues new access token + new refresh token (rotation)
    6. Original failed request is retried with new access token
    7. If refresh token is invalid/expired → user redirected to login
```

---

## 14. i18n Strategy

### 14.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       i18n ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────┘

  FRONTEND (react-i18next)                    BACKEND
  ┌──────────────────────┐          ┌──────────────────────┐
  │ JSON Translation     │          │ API Response Language │
  │ Files (per namespace)│          │ • Accept-Language     │
  │                      │          │   header detection    │
  │ en/                  │          │ • Fallback: en        │
  │   common.json        │          │ • Stored preference   │
  │   auth.json          │          │   in User model       │
  │   admin.json         │          │                      │
  │   ...                │          │ Multilingual Content  │
  │                      │          │ stored in DB:         │
  │ so/                  │          │ • { en, so, ar }      │
  │   common.json        │          │   objects for titles, │
  │   ...                │          │   descriptions, etc.  │
  │                      │          │                      │
  │ ar/                  │          │ RTL Support:          │
  │   common.json        │          │ • dir="rtl" for Arabic│
  │   ...                │          │ • CSS logical props   │
  └──────────────────────┘          └──────────────────────┘
```

### 14.2 Language Codes
- `en` — English (default, fallback)
- `so` — Somali
- `ar` — Arabic (RTL)

### 14.3 Translation Key Naming Convention

```json
{
  "namespace": {
    "section": {
      "action": "Translation text",
      "action_subaction": "Translation text"
    }
  }
}
```

Example:
```json
{
  "auth": {
    "login": {
      "title": "Sign In to Your Account",
      "email_label": "Email Address",
      "email_placeholder": "Enter your email",
      "password_label": "Password",
      "password_placeholder": "Enter your password",
      "submit_button": "Sign In",
      "forgot_password": "Forgot your password?",
      "no_account": "Don't have an account?",
      "register_link": "Create one"
    },
    "errors": {
      "invalid_credentials": "Invalid email or password",
      "account_locked": "Account temporarily locked. Please try again later.",
      "email_not_verified": "Please verify your email before logging in"
    }
  }
}
```

### 14.4 Date & Number Formatting
- Use `Intl.DateTimeFormat` for locale-aware dates
- Support Hijri calendar for Islamic dates (via `@umalqura/core` or similar)
- Use `Intl.NumberFormat` for currency (USD, SOS)
- All dates stored in UTC, formatted per user locale

---

## 15. Performance Optimizations

### 15.1 Frontend

| Optimization | Implementation |
|---|---|
| Code Splitting | Route-based lazy loading via `React.lazy` + `Suspense` |
| Image Optimization | Lazy loading (`loading="lazy"`), WebP format, responsive sizes |
| Bundle Optimization | Vite code splitting, tree shaking, minification |
| Caching | Service Worker for offline support, HTTP caching headers |
| Font Loading | `font-display: swap`, subset fonts (Latin + Arabic) |
| Animation | Framer Motion with `layoutId`, GPU-accelerated transforms |
| Virtual Scrolling | For large lists (`react-window` or `@tanstack/react-virtual`) |
| Memoization | `React.memo`, `useMemo`, `useCallback` where profiled |
| Network | TanStack Query with stale-while-revalidate, optimistic updates |
| Prefetching | Prefetch data on hover/mouse-enter for faster perceived loads |

### 15.2 Backend

| Optimization | Implementation |
|---|---|
| Connection Pooling | MongoDB connection pool (default: 100 connections) |
| Caching | Redis for settings, course data, public content (TTL: 10 min) |
| Compression | gzip/brotli via Nginx or compression middleware |
| Pagination | Cursor-based pagination for large datasets |
| Indexing | Proper MongoDB indexes based on query patterns |
| Aggregation | MongoDB aggregation pipeline for complex reports |
| Background Jobs | Bull + Redis for email, PDF generation, notifications |
| Cluster Mode | PM2 cluster mode (1 process per CPU core) |
| Rate Limiting | Token bucket algorithm via Redis |
| Response Caching | Cache-Control headers for public endpoints |

### 15.3 Database

| Optimization | Implementation |
|---|---|
| Indexes | Compound indexes on frequently queried fields |
| Text Search | MongoDB text indexes for search functionality |
| Read/Write Splitting | If needed in future: primary for writes, secondaries for reads |
| Data Archival | Move old logs and records to cold storage after 90 days |
| Query Optimization | Use `.explain()` to analyze query performance |
| Schema Design | Embed data where appropriate, reference where needed |
| TTL Indexes | Automatic cleanup of logs, tokens, temporary data |

---

## Appendix A: Color Palette & Design Tokens

### Islamic Green Theme with Gold Accent

```css
:root {
  /* Primary — Islamic Green */
  --color-primary-50:  #f0fdf4;
  --color-primary-100: #dcfce7;
  --color-primary-200: #bbf7d0;
  --color-primary-300: #86efac;
  --color-primary-400: #4ade80;
  --color-primary-500: #22c55e;  /* Base Green */
  --color-primary-600: #16a34a;
  --color-primary-700: #15803d;
  --color-primary-800: #166534;
  --color-primary-900: #14532d;
  --color-primary-950: #052e16;

  /* Accent — Gold */
  --color-accent-50:  #fffbeb;
  --color-accent-100: #fef3c7;
  --color-accent-200: #fde68a;
  --color-accent-300: #fcd34d;
  --color-accent-400: #fbbf24;
  --color-accent-500: #f59e0b;  /* Base Gold */
  --color-accent-600: #d97706;
  --color-accent-700: #b45309;
  --color-accent-800: #92400e;
  --color-accent-900: #78350f;

  /* Neutral */
  --color-neutral-50:  #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-200: #e5e5e5;
  --color-neutral-300: #d4d4d4;
  --color-neutral-400: #a3a3a3;
  --color-neutral-500: #737373;
  --color-neutral-600: #525252;
  --color-neutral-700: #404040;
  --color-neutral-800: #262626;
  --color-neutral-900: #171717;
  --color-neutral-950: #0a0a0a;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-arabic: 'Noto Naskh Arabic', 'Scheherazade New', serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing (4px base) */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */

  /* Border Radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-gold: 0 0 30px rgba(245, 158, 11, 0.3);

  /* Glass Morphism */
  --glass-bg: rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.2);
  --glass-blur: blur(20px);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);

  /* Dark Mode Glass */
  --glass-bg-dark: rgba(0, 0, 0, 0.3);
  --glass-border-dark: rgba(255, 255, 255, 0.08);
}
```

---

## Appendix B: Permissions Matrix

### Permission Modules

| Module | Permissions |
|---|---|
| **users** | `users.create`, `users.read`, `users.update`, `users.delete`, `users.manage` |
| **students** | `students.create`, `students.read`, `students.update`, `students.delete`, `students.export`, `students.import` |
| **parents** | `parents.create`, `parents.read`, `parents.update`, `parents.delete` |
| **teachers** | `teachers.create`, `teachers.read`, `teachers.update`, `teachers.delete` |
| **courses** | `courses.create`, `courses.read`, `courses.update`, `courses.delete`, `courses.manage` |
| **classes** | `classes.create`, `classes.read`, `classes.update`, `classes.delete` |
| **attendance** | `attendance.create`, `attendance.read`, `attendance.update`, `attendance.report` |
| **exams** | `exams.create`, `exams.read`, `exams.update`, `exams.delete`, `exams.grade` |
| **results** | `results.create`, `results.read`, `results.update`, `results.publish`, `results.export` |
| **assignments** | `assignments.create`, `assignments.read`, `assignments.update`, `assignments.delete`, `assignments.grade` |
| **payments** | `payments.create`, `payments.read`, `payments.update`, `payments.delete`, `payments.refund`, `payments.report` |
| **certificates** | `certificates.create`, `certificates.read`, `certificates.delete`, `certificates.manage` |
| **announcements** | `announcements.create`, `announcements.read`, `announcements.update`, `announcements.delete` |
| **news** | `news.create`, `news.read`, `news.update`, `news.delete`, `news.publish` |
| **events** | `events.create`, `events.read`, `events.update`, `events.delete`, `events.manage` |
| **gallery** | `gallery.create`, `gallery.read`, `gallery.update`, `gallery.delete`, `gallery.manage` |
| **messages** | `messages.send`, `messages.read`, `messages.delete` |
| **notifications** | `notifications.send`, `notifications.read`, `notifications.manage` |
| **roles** | `roles.create`, `roles.read`, `roles.update`, `roles.delete` |
| **permissions** | `permissions.create`, `permissions.read`, `permissions.update` |
| **settings** | `settings.read`, `settings.update`, `settings.manage` |
| **donations** | `donations.create`, `donations.read`, `donations.update`, `donations.report` |
| **analytics** | `analytics.read`, `analytics.export` |
| **logs** | `logs.read`, `logs.export`, `logs.delete` |

### Role-Permission Matrix

| Permission | Super Admin | Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Full system access | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage users (all roles) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage courses | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage own courses | ✅ | ✅ | ✅ | ❌ | ❌ |
| Grade exams | ✅ | ✅ | ✅ | ❌ | ❌ |
| View own data | ✅ | ✅ | ✅ | ✅ | ✅ |
| View children data | ✅ | ✅ | ❌ | ❌ | ✅ |
| Manage settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Send messages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage roles/permissions | ✅ | ❌ | ❌ | ❌ | ❌ |
| View logs | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Appendix C: Status Codes Used

| Code | Constant | Usage |
|---|---|---|
| `active` | ACTIVE | Entity is currently active |
| `inactive` | INACTIVE | Entity is deactivated |
| `draft` | DRAFT | Content not yet published |
| `published` | PUBLISHED | Content is live |
| `archived` | ARCHIVED | Content is archived |
| `pending` | PENDING | Awaiting action |
| `completed` | COMPLETED | Action completed |
| `failed` | FAILED | Action failed |
| `cancelled` | CANCELLED | Action was cancelled |
| `suspended` | SUSPENDED | Temporarily disabled |
| `graduated` | GRADUATED | Student completed all courses |
| `present` | PRESENT | Attendance: present |
| `absent` | ABSENT | Attendance: absent |
| `late` | LATE | Attendance: late |
| `excused` | EXCUSED | Attendance: excused absence |
| `pass` | PASS | Result: passed |
| `fail` | FAIL | Result: failed |

---

> **بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ**  
> *"In the name of Allah, the Most Gracious, the Most Merciful"*

---

**Document Status:** ✅ Complete  
**Next Step:** Code Generation (upon approval of this architecture)  
**Last Updated:** 8 July 2026