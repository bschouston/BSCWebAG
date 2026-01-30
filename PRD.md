# Product Requirements Document (PRD)
## Burhani Sports Club Houston WebApp

**Version:** 1.0  
**Last Updated:** 2024  
**Status:** Production

---

## 1. Executive Summary

### 1.1 Product Overview
The Burhani Sports Club Houston WebApp is a comprehensive event management platform designed to facilitate weekly sports events for the community. The application enables members to discover events, manage RSVPs, purchase tokens, and maintain their profiles, while providing administrators with tools to create and manage events, handle RSVPs, and oversee the platform.

### 1.2 Business Objectives
- Streamline event registration and RSVP management
- Provide transparent token-based payment system
- Enable efficient event administration
- Build community engagement through news and event discovery
- Maintain secure user management and role-based access

### 1.3 Target Users
- **Public Visitors:** Browse events and news without authentication
- **Members:** Registered users who can RSVP to events and manage their accounts
- **Admins:** Event managers who create and manage events
- **Super Admins:** System administrators with full platform control

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

#### MEMBER (Default Role)
- **Default Assignment:** All new users automatically receive MEMBER role
- **Access:**
  - Member dashboard (`/member`)
  - RSVP to events
  - View personal calendar
  - Manage token balance and history
  - Update profile (name, phone, skill levels, emergency contacts, preferences)
  - Purchase token packs
  - View own RSVP status and waitlist position
- **Restrictions:**
  - Cannot create, edit, or delete events
  - Cannot manage other users' RSVPs
  - Cannot access admin areas

#### ADMIN
- **Assignment:** Must be assigned by SUPER_ADMIN
- **Access:** All MEMBER permissions plus:
  - Admin dashboard (`/admin`)
  - Create, edit, delete events
  - Manage event capacity, tokens required, gender policy, visibility, status
  - View and manage all RSVPs for events
  - Promote waitlisted users
  - Mark attendance (attended/no-show)
  - Filter RSVPs by gender/sport
  - Manage event series and locations
  - **Add and edit news articles** (create, edit, publish/unpublish news posts)
- **Restrictions:**
  - Cannot manage users
  - Cannot assign roles
  - Cannot activate/deactivate users

#### SUPER_ADMIN
- **Assignment:** Must be assigned manually (typically via seed script)
- **Access:** All ADMIN and MEMBER permissions plus:
  - Super admin dashboard (`/superadmin`)
  - User management (`/superadmin/users`)
    - Search and view all users
    - Activate/deactivate user accounts
    - Assign roles (MEMBER, ADMIN, SUPER_ADMIN)
  - Billing management (`/superadmin/billing`)
    - Add/remove tokens from any user account
    - View all token transactions
    - Manage purchase status
    - View purchase statistics and revenue
  - Full system access and audit logs

---

## 3. Feature Requirements

### 3.1 Public Pages (No Authentication Required)

#### 3.1.1 Homepage (`/`)
- **Hero Section:**
  - Club introduction
  - Call-to-action buttons (Join Now, View Events)
  - Dark blue background (light mode) / Yellow background (dark mode)
  - Yellow accent colors matching brand theme
- **Upcoming Events Preview:**
  - Display 3-6 upcoming events
  - Show event title, date, sport, location, category tag
  - Link to full events page
  - Optionally filter by category (Weekly Sports, Monthly Events, Featured Events)
- **Latest News Preview:**
  - Display 3-6 latest news posts
  - Show title, excerpt, publish date
  - Link to full news page

#### 3.1.2 Events Page (`/events`)
- **Event Listing:**
  - Grid/list view of all published events
  - **Category Dropdown Filter:**
    - "Weekly Sports" - Regular weekly recurring sports events
    - "Monthly Events" - Special monthly events
    - "Featured Events" - Highlighted/promoted events
    - "All Events" - Show all events (default)
  - Filter by:
    - Category (Weekly Sports, Monthly Events, Featured Events)
    - Sport
    - Gender policy (ALL, MALE_ONLY, FEMALE_ONLY)
    - Date range
  - Sort by date (upcoming first)
- **Event Details Page (`/events/[id]`):**
  - Full event information
  - Date, time, location
  - Capacity and current RSVP count
  - Tokens required
  - Gender policy
  - Description
  - RSVP button (requires login)

#### 3.1.3 News Page (`/news`)
- **News Listing:**
  - Chronological list of published news posts
  - Pagination support
  - Filter by date
- **News Detail Page (`/news/[slug]`):**
  - Full article content
  - Author information
  - Publish date
  - Featured image (if available)

#### 3.1.4 About Page (`/about`)
- Club mission and values
- History and background
- Contact information

#### 3.1.5 Contact Page (`/contact`)
- Contact form with fields:
  - Name
  - Email
  - Subject
  - Message
- Form submission stores message in Firestore
- Success/error feedback

### 3.2 Authentication

#### 3.2.1 Login Page (`/login`)
- **Google Sign-In Only:**
  - Single sign-in button
  - Uses Firebase `signInWithRedirect`
  - Handles redirect result automatically
- **Flow:**
  1. User clicks "Sign in with Google"
  2. Redirects to Google OAuth
  3. Returns to app with authentication
  4. Checks if user exists in backend (`/api/auth/me`)
  5. If new user: registers automatically (`/api/auth/register`)
  6. Waits for user to be saved in Firestore
  7. Verifies user exists before redirecting
  8. Redirects to `/member` dashboard
- **Already Authenticated:**
  - If user is already logged in, redirects to `/member`

#### 3.2.2 Register Page (`/register`)
- Same flow as login (Google Sign-In only)
- Auto-registers new users
- Extracts name from Google profile or email

#### 3.2.3 Forgot Password (`/forgot-password`)
- Placeholder page (not currently implemented)
- Future: Email/password reset flow

### 3.3 Member Zone (Authentication Required)

#### 3.3.1 Member Dashboard (`/member`)
- **Welcome Section:**
  - Personalized greeting with user's name
- **Token Balance Card:**
  - Current token balance
  - Quick link to purchase tokens
- **Upcoming Events Card:**
  - Count of confirmed RSVPs
  - Link to events page
- **Profile Status Card:**
  - Completion status
  - Link to edit profile
- **Quick Actions:**
  - Browse upcoming events
  - View token history
  - View calendar
- **Token Packages Preview:**
  - Display available token packages
  - Quick purchase links

#### 3.3.2 Member Events (`/member/events`)
- **My RSVPs:**
  - List of events user has RSVP'd to
  - Show RSVP status (CONFIRMED, WAITLISTED, CANCELLED)
  - Waitlist position (if waitlisted)
  - Cancel RSVP option
- **Available Events:**
  - Browse events user can RSVP to
  - Filter by sport, date, gender policy
  - RSVP button with token requirement display
  - Automatic token deduction on RSVP

#### 3.3.3 Member Calendar (`/member/calendar`)
- Calendar view of RSVP'd events
- Past and upcoming events
- Event details on click
- Filter by date range

#### 3.3.4 Token Management (`/member/tokens`)
- **Current Balance:**
  - Display token balance
  - Calculated from ledger or cached value
- **Transaction History:**
  - List of all token transactions
  - Show type (CREDIT/DEBIT)
  - Amount, description, date
  - Filter by date range
  - Pagination

#### 3.3.5 Profile Management (`/member/profile`)
- **Basic Information:**
  - First name
  - Last name
  - Email (read-only)
  - Phone number
- **Sport Profiles:**
  - Select sports user participates in
  - Set skill level per sport
- **Emergency Contact (ICE):**
  - Contact name
  - Phone number
  - Relationship
- **Preferences:**
  - Email notifications (on/off)
  - SMS notifications (on/off)
  - Preferred sports (multi-select)
  - Gender preference for events

#### 3.3.6 Token Purchase (`/member/purchase`)
- **Token Packages:**
  - Display available token packages
  - Package name, token amount, price
  - Purchase button
- **Payment Integration:**
  - Stripe integration (if configured)
  - Demo mode if Stripe not configured
  - Purchase records saved as `PENDING` status
- **Purchase History:**
  - List of past purchases
  - Status tracking

### 3.4 Admin Dashboard (ADMIN/SUPER_ADMIN Role Required)

#### 3.4.1 Admin Dashboard (`/admin`)
- **Statistics Overview:**
  - Total events
  - Upcoming events
  - Total RSVPs
  - Active members
- **Quick Actions:**
  - Create new event
  - View all events
  - Manage RSVPs
  - Manage news articles

#### 3.4.2 Event Management (`/admin/events`)
- **Event List:**
  - Table/grid view of all events
  - Filter by status, sport, date
  - Search functionality
- **Create Event:**
  - Form fields:
    - Title
    - Description
    - **Category (dropdown):**
      - Weekly Sports
      - Monthly Events
      - Featured Events
    - Sport (dropdown)
    - Location (dropdown)
    - Start time
    - End time
    - Capacity
    - Tokens required
    - Gender policy (ALL, MALE_ONLY, FEMALE_ONLY)
    - Visibility (PUBLIC, MEMBERS_ONLY)
    - Status (DRAFT, PUBLISHED, CANCELLED, COMPLETED)
    - Link to event series (optional)
- **Edit Event:**
  - Same form as create, pre-filled
  - Update any field
- **Delete Event:**
  - Soft delete (mark as CANCELLED)
  - Cannot delete if event has RSVPs

#### 3.4.3 RSVP Management (`/admin/events/[id]/rsvps`)
- **Confirmed RSVPs:**
  - List of confirmed attendees
  - User name, email
  - RSVP date
  - Mark attended/no-show
  - Remove RSVP option
- **Waitlist:**
  - List of waitlisted users
  - Waitlist position
  - Promote to confirmed (when capacity available)
  - Remove from waitlist
- **Filters:**
  - Filter by gender
  - Filter by sport preference
  - Search by name/email

#### 3.4.4 News Management (`/admin/news`)
- **News List:**
  - Table/list view of all news posts
  - Filter by status (draft, published)
  - Search by title or content
  - Sort by publish date
- **Create News Article:**
  - Form fields:
    - Title
    - Slug (optional; auto-generated from title if not provided)
    - Excerpt/summary
    - Full content (rich text or markdown)
    - Featured image (optional)
    - Author (defaults to current user)
    - Publish date
    - Status (DRAFT, PUBLISHED)
- **Edit News Article:**
  - Same form as create, pre-filled
  - Update any field
  - Change status (draft ↔ published)
- **Delete News Article:**
  - Soft delete or permanent delete (per product decision)
  - Only admins and super admins can delete

### 3.5 Super Admin Dashboard (SUPER_ADMIN Role Required)

#### 3.5.1 Super Admin Dashboard (`/superadmin`)
- **System Statistics:**
  - Total users
  - Active users
  - Total purchases
  - Total revenue
- **Quick Links:**
  - User management
  - Billing management

#### 3.5.2 User Management (`/superadmin/users`)
- **User List:**
  - Table of all users
  - Search by name or email
  - Display: Name, Email, Role, Token Balance, Status
- **Role Management:**
  - Dropdown to change user role
  - Options: MEMBER, ADMIN, SUPER_ADMIN
  - Changes logged in audit_log
- **User Status:**
  - Activate/deactivate users
  - Toggle button
  - Status badge display

#### 3.5.3 Billing Management (`/superadmin/billing`)
- **Statistics Dashboard:**
  - Total purchases count
  - Completed purchases
  - Pending purchases
  - Total revenue (from completed purchases)
- **Token Management:**
  - **Add Tokens:**
    - Select user from dropdown
    - Enter token amount
    - Optional description
    - Creates CREDIT transaction
    - Updates user balance
    - Logs in audit_log
  - **Remove Tokens:**
    - Select user from dropdown
    - Enter token amount
    - Validates sufficient balance
    - Creates DEBIT transaction
    - Updates user balance
    - Logs in audit_log
  - **Transaction History:**
    - View all token transactions
    - Filter by user
    - Show type, amount, description, date
- **Purchase Management:**
  - **Purchase List:**
    - Table of all purchases
    - Display: User, Amount, Tokens, Status, Date
    - Search by user name/email/purchase ID
    - Filter by status (PENDING, COMPLETED, FAILED, REFUNDED)
  - **Update Purchase Status:**
    - Dropdown to change status
    - When changed from PENDING to COMPLETED:
      - Automatically credits tokens to user
      - Updates user balance
      - Creates transaction record
      - Logs in audit_log

---

## 4. Technical Requirements

### 4.1 Technology Stack
- **Framework:** Next.js 16.1.1 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Radix UI primitives)
- **Authentication:** Firebase Authentication (Google Sign-In)
- **Database:** Firebase Firestore
- **Server SDK:** Firebase Admin SDK
- **Theme Management:** next-themes
- **Form Validation:** Zod
- **Icons:** lucide-react

### 4.2 Design System

#### 4.2.1 Color Theme
- **Light Mode:**
  - Primary Background: White
  - Primary Text: Dark Blue (#1a3556)
  - Accent: Gold/Yellow
  - Hero Background: Dark Blue
- **Dark Mode:**
  - Primary Background: Dark Blue (#0f1a2e)
  - Primary Text: White/Gold
  - Accent: Gold/Yellow
  - Hero Background: Yellow
- **Brand Colors:**
  - Dark Blue: #1a3556
  - Gold/Yellow: Theme-specific yellow
  - Footer Dark: #0f1a2e (dark mode)

#### 4.2.2 Typography
- Font family: System fonts (sans-serif)
- Headings: Bold, larger sizes
- Body: Regular weight, readable sizes
- Consistent spacing and line heights

#### 4.2.3 Components
- Responsive design (mobile-first)
- Consistent button styles
- Card-based layouts
- Sidebar navigation for dashboards
- Dropdown menus for user actions
- Modal dialogs for confirmations
- Toast notifications for feedback

### 4.3 Data Model

#### 4.3.1 Core Collections
- `users` - User accounts with roles and token balances
- `roles` - Role definitions
- `user_roles` - User-role assignments
- `sports` - Available sports
- `skill_levels` - Skill level definitions
- `user_sport_profiles` - User skill levels per sport
- `user_emergency_contacts` - Emergency contact information
- `user_preferences` - User preferences
- `locations` - Event locations
- `event_series` - Recurring event series
- `events` - Individual events (with category field: WEEKLY_SPORTS, MONTHLY_EVENTS, FEATURED_EVENTS)
- `event_rsvps` - RSVP records
- `news_posts` - News articles
- `contact_messages` - Contact form submissions
- `token_transactions` - Token transaction ledger
- `token_packages` - Available token packages
- `products` - Products for sale
- `subscriptions` - User subscriptions
- `purchases` - Purchase records
- `audit_log` - System audit trail

#### 4.3.2 Key Constraints
- Unique email per user
- Unique RSVP per user per event (document ID: `${eventId}_${userId}`)
- Token balance computed from ledger (with optional cache on user document)
- Role assignments tracked in both `users.role` and `user_roles` collection

### 4.4 Security Requirements

#### 4.4.1 Authentication
- Firebase Authentication with Google Sign-In
- JWT token verification for all API routes
- Token expiration handling
- Automatic token refresh

#### 4.4.2 Authorization
- Role-based access control (RBAC)
- Route protection based on role
- API endpoint protection
- Frontend UI element visibility based on role

#### 4.4.3 Data Security
- Firestore security rules (to be implemented)
- Input validation (Zod schemas)
- SQL injection prevention (Firestore handles this)
- XSS prevention (React auto-escaping)

### 4.5 Performance Requirements
- Fast page load times (< 3 seconds)
- Efficient Firestore queries with indexes
- Pagination for large lists
- Optimistic UI updates where appropriate
- Image optimization (Next.js Image component)

### 4.6 Accessibility Requirements
- Semantic HTML
- ARIA labels where needed
- Keyboard navigation support
- Screen reader compatibility
- Color contrast compliance

---

## 5. User Stories

### 5.1 Public User Stories
- As a visitor, I want to browse upcoming events so I can see what's available
- As a visitor, I want to read news articles so I can stay informed
- As a visitor, I want to contact the club so I can ask questions

### 5.2 Member User Stories
- As a member, I want to RSVP to events so I can participate
- As a member, I want to see my token balance so I know how many events I can attend
- As a member, I want to purchase tokens so I can RSVP to more events
- As a member, I want to view my calendar so I can see my upcoming events
- As a member, I want to update my profile so my information is current
- As a member, I want to see my RSVP status so I know if I'm confirmed or waitlisted

### 5.3 Admin User Stories
- As an admin, I want to create events so members can RSVP
- As an admin, I want to manage RSVPs so I can handle capacity
- As an admin, I want to promote waitlisted users so I can fill spots
- As an admin, I want to mark attendance so I can track participation
- As an admin, I want to add and edit news articles so the club can share updates with members

### 5.4 Super Admin User Stories
- As a super admin, I want to manage users so I can control access
- As a super admin, I want to assign roles so I can delegate permissions
- As a super admin, I want to manage tokens so I can handle adjustments
- As a super admin, I want to manage purchases so I can process payments

---

## 6. Success Metrics

### 6.1 User Engagement
- Number of active members
- Event RSVP rate
- Token purchase frequency
- Profile completion rate

### 6.2 Platform Health
- System uptime
- API response times
- Error rates
- User satisfaction

### 6.3 Business Metrics
- Total revenue from token purchases
- Number of events created
- Average RSVPs per event
- User retention rate

---

## 7. Future Enhancements

### 7.1 Planned Features
- Email notifications for events
- SMS notifications
- Event reminders
- Recurring membership subscriptions
- Event check-in via QR code
- Mobile app (React Native)
- Social features (member directory, messaging)

### 7.2 Technical Improvements
- Firestore security rules implementation
- Comprehensive error handling
- Performance optimization
- Caching strategies
- Analytics integration
- SEO optimization

---

## 8. Dependencies & Integrations

### 8.1 External Services
- **Firebase:**
  - Authentication
  - Firestore Database
  - Admin SDK
- **Stripe (Optional):**
  - Payment processing
  - Subscription management
- **Google:**
  - OAuth for sign-in

### 8.2 Environment Variables Required
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `STRIPE_SECRET_KEY` (optional)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (optional)
- `STRIPE_WEBHOOK_SECRET` (optional)

---

## 9. Acceptance Criteria

### 9.1 Core Functionality
- ✅ Users can sign in with Google
- ✅ Users can browse events without authentication
- ✅ Members can RSVP to events
- ✅ Token system works correctly
- ✅ Admins can create and manage events
- ✅ Admins can add and edit news articles
- ✅ Super admins can manage users and billing
- ✅ Role-based access control works
- ✅ Responsive design works on mobile and desktop

### 9.2 Quality Standards
- Code follows TypeScript best practices
- Components are reusable and maintainable
- Error handling is comprehensive
- User feedback is clear and helpful
- Performance is acceptable
- Security is properly implemented

---

## 10. Glossary

- **RSVP:** Reservation/confirmation of attendance to an event
- **Token:** Virtual currency used to RSVP to events
- **Waitlist:** Queue of users waiting for event capacity
- **ICE Contact:** In Case of Emergency contact information
- **Firestore:** Firebase's NoSQL database
- **JWT:** JSON Web Token for authentication
- **RBAC:** Role-Based Access Control

---

**Document End**
