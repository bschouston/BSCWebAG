# Technical Design Document
## Burhani Sports Club Houston WebApp

**Version:** 1.0  
**Last Updated:** 2024  
**Status:** Production

---

## 1. Architecture Overview

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│  Next.js App Router (React + TypeScript)                    │
│  - Pages (Server/Client Components)                         │
│  - Components (UI Library: shadcn/ui)                      │
│  - Hooks (Custom React Hooks)                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                              │
│  Next.js Route Handlers (/api/*)                           │
│  - Authentication Middleware                               │
│  - Role-based Authorization                                │
│  - Request Validation (Zod)                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  Firebase Admin SDK                                        │
│  - Firestore Operations                                    │
│  - Authentication Verification                             │
│  - Token Management                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  Firebase Firestore (NoSQL)                                │
│  - Collections (Users, Events, RSVPs, etc.)                 │
│  - Security Rules                                          │
│  - Indexes                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

#### Frontend
- **Framework:** Next.js 16.1.1 (App Router)
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS 3.x
- **UI Components:** shadcn/ui (built on Radix UI)
- **Icons:** lucide-react
- **Theme:** next-themes (dark/light mode)
- **Forms:** React Hook Form + Zod validation
- **State Management:** React Hooks (useState, useEffect)

#### Backend
- **Runtime:** Node.js (via Next.js API Routes)
- **Authentication:** Firebase Authentication
- **Database:** Firebase Firestore
- **Admin SDK:** Firebase Admin SDK
- **Validation:** Zod schemas

#### Infrastructure
- **Hosting:** Any Node.js hosting (Vercel, Replit, etc.)
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth
- **Payments:** Stripe (optional)

---

## 2. Project Structure

```
project-root/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API Route Handlers
│   │   │   ├── auth/                 # Authentication endpoints
│   │   │   │   ├── me/               # GET: Get current user
│   │   │   │   └── register/         # POST: Register new user
│   │   │   ├── admin/                # Admin endpoints
│   │   │   │   ├── events/           # CRUD operations for events
│   │   │   │   └── stats/           # GET: Admin statistics
│   │   │   ├── member/               # Member endpoints
│   │   │   │   ├── profile/          # GET, PATCH: User profile
│   │   │   │   ├── tokens/          # GET: Token balance & history
│   │   │   │   ├── rsvps/           # GET, POST: RSVP management
│   │   │   │   └── calendar/        # GET: User's calendar events
│   │   │   ├── superadmin/          # Super admin endpoints
│   │   │   │   ├── users/           # GET, PATCH: User management
│   │   │   │   ├── tokens/          # GET, POST, DELETE: Token management
│   │   │   │   └── purchases/       # GET, PATCH: Purchase management
│   │   │   ├── events/              # GET: Public events
│   │   │   ├── news/                # GET: Public news
│   │   │   └── contact/             # POST: Contact form
│   │   ├── (public pages)           # Public routes
│   │   │   ├── page.tsx             # Homepage
│   │   │   ├── events/              # Events listing & detail
│   │   │   ├── news/                # News listing & detail
│   │   │   ├── about/               # About page
│   │   │   └── contact/             # Contact page
│   │   ├── (auth pages)             # Authentication routes
│   │   │   ├── login/               # Login page
│   │   │   ├── register/            # Registration page
│   │   │   └── forgot-password/     # Password reset
│   │   ├── member/                  # Member zone (protected)
│   │   │   ├── page.tsx             # Member dashboard
│   │   │   ├── profile/             # Profile management
│   │   │   ├── events/              # My events & RSVPs
│   │   │   ├── calendar/            # Calendar view
│   │   │   ├── tokens/              # Token balance & history
│   │   │   └── purchase/            # Token purchase
│   │   ├── admin/                   # Admin zone (protected)
│   │   │   ├── page.tsx             # Admin dashboard
│   │   │   └── events/              # Event management
│   │   ├── superadmin/              # Super admin zone (protected)
│   │   │   ├── page.tsx             # Super admin dashboard
│   │   │   ├── users/               # User management
│   │   │   └── billing/            # Billing management
│   │   ├── layout.tsx               # Root layout
│   │   ├── globals.css              # Global styles
│   │   └── error.tsx                # Error boundary
│   ├── components/                   # React components
│   │   ├── layout/                  # Layout components
│   │   │   ├── navbar.tsx           # Navigation bar
│   │   │   └── footer.tsx           # Footer
│   │   ├── dashboard/               # Dashboard components
│   │   │   ├── dashboard-layout.tsx # Dashboard wrapper
│   │   │   ├── member-sidebar.tsx   # Member navigation
│   │   │   ├── admin-sidebar.tsx     # Admin navigation
│   │   │   └── superadmin-sidebar.tsx # Super admin navigation
│   │   ├── home/                    # Homepage components
│   │   │   ├── hero-section.tsx     # Hero section
│   │   │   ├── upcoming-events.tsx  # Events preview
│   │   │   ├── latest-news.tsx       # News preview
│   │   │   └── cta-section.tsx      # Call-to-action
│   │   ├── events/                   # Event components
│   │   ├── news/                     # News components
│   │   └── ui/                      # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── avatar.tsx
│   │       └── ... (other UI components)
│   ├── lib/                         # Utilities & configurations
│   │   ├── firebase/                # Firebase setup
│   │   │   ├── client.ts            # Firebase client SDK
│   │   │   └── admin.ts             # Firebase Admin SDK
│   │   └── utils.ts                 # Utility functions
│   └── hooks/                       # Custom React hooks
│       └── use-toast.ts             # Toast notifications
├── db/                              # Database documentation
│   ├── schema.sql                   # SQL schema (reference)
│   └── firestore_schema.md          # Firestore mapping
├── public/                          # Static assets
│   └── logo.png                     # Club logo
├── .env.local                       # Environment variables
├── next.config.mjs                  # Next.js configuration
├── tailwind.config.ts               # Tailwind configuration
├── tsconfig.json                    # TypeScript configuration
├── package.json                     # Dependencies
└── README.md                        # Project documentation
```

---

## 3. Data Model

### 3.1 Firestore Collections

#### 3.1.1 Users Collection
```typescript
{
  id: string,                    // Firebase UID (document ID)
  email: string,                 // Unique, indexed
  firstName: string,
  lastName: string,
  phone: string | null,
  role: "MEMBER" | "ADMIN" | "SUPER_ADMIN",  // Default: "MEMBER"
  tokenBalance: number,           // Cached balance (computed from ledger)
  isActive: boolean,             // Default: true
  createdAt: Timestamp
}
```

#### 3.1.2 Events Collection
```typescript
{
  id: string,                    // Document ID
  title: string,
  description: string | null,
  category: "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS",  // Indexed
  sportId: string,               // Reference to sports collection
  locationId: string | null,     // Reference to locations collection
  seriesId: string | null,       // Reference to event_series collection
  startTime: Timestamp,         // Indexed
  endTime: Timestamp,
  capacity: number,
  tokensRequired: number,        // Default: 1
  genderPolicy: "ALL" | "MALE_ONLY" | "FEMALE_ONLY",  // Default: "ALL"
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED",  // Indexed
  isPublic: boolean,             // Default: true
  createdAt: Timestamp,
  createdBy: string | null       // User ID
}
```

#### 3.1.3 Event RSVPs Collection
```typescript
{
  id: string,                    // Document ID: `${eventId}_${userId}`
  eventId: string,               // Indexed
  userId: string,                // Indexed
  status: "CONFIRMED" | "WAITLISTED" | "CANCELLED",
  waitlistPosition: number | null,  // Only set when WAITLISTED
  attended: boolean | null,      // Set after event
  createdAt: Timestamp
}
```

#### 3.1.4 Token Transactions Collection
```typescript
{
  id: string,                    // Document ID
  userId: string,                 // Indexed
  type: "CREDIT" | "DEBIT",
  amount: number,
  description: string | null,
  eventId: string | null,        // If related to event
  createdAt: Timestamp            // Indexed
}
```

#### 3.1.5 Purchases Collection
```typescript
{
  id: string,                    // Document ID
  userId: string,                 // Indexed
  packageId: string | null,       // Reference to token_packages
  productId: string | null,      // Reference to products
  amount: number,                 // In cents
  tokens: number,                // Tokens to credit
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED",  // Indexed
  stripePaymentId: string | null,  // Stripe payment ID
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 3.1.6 User Roles Collection
```typescript
{
  id: string,                    // Document ID: `${userId}_${roleId}`
  userId: string,                 // Indexed
  roleId: string,                 // "MEMBER", "ADMIN", or "SUPER_ADMIN"
  assignedAt: Timestamp,
  assignedBy: string | null       // User ID who assigned
}
```

#### 3.1.7 Audit Log Collection
```typescript
{
  id: string,                    // Document ID
  userId: string | null,         // Indexed (user who performed action)
  action: string,                // Indexed (e.g., "ROLE_CHANGED", "TOKEN_CREDIT")
  entityType: string,            // Indexed (e.g., "USER", "EVENT", "PURCHASE")
  entityId: string | null,       // ID of affected entity
  details: object,                // JSON object with action details
  ipAddress: string | null,
  userAgent: string | null,
  createdAt: Timestamp           // Indexed
}
```

### 3.2 Indexes Required

#### Composite Indexes
- `events`: `status + startTime` (for published events query)
- `events`: `category + status + startTime` (for category-filtered published events)
- `events`: `sportId + startTime` (for sport-specific queries)
- `events`: `category + sportId + startTime` (for category and sport filtered queries)
- `event_rsvps`: `eventId + status` (for counting confirmed/waitlisted)
- `event_rsvps`: `eventId + createdAt` (for ordering RSVPs)
- `event_rsvps`: `userId + createdAt` (for user's RSVP history)
- `token_transactions`: `userId + createdAt` (for transaction history)
- `purchases`: `userId + createdAt` (for purchase history)
- `audit_log`: `userId + createdAt` (for user activity)
- `audit_log`: `entityType + entityId` (for entity history)

---

## 4. API Design

### 4.1 Authentication Endpoints

#### GET `/api/auth/me`
- **Purpose:** Get current authenticated user
- **Auth:** Required (Bearer token)
- **Response:**
  ```typescript
  {
    id: string,
    email: string,
    firstName: string,
    lastName: string,
    role: string,
    tokenBalance: number,
    isActive: boolean
  }
  ```
- **Errors:**
  - `401`: Unauthorized (invalid token)
  - `404`: User not found
  - `500`: Server error

#### POST `/api/auth/register`
- **Purpose:** Register new user in Firestore
- **Auth:** Required (Bearer token)
- **Body:**
  ```typescript
  {
    uid: string,
    email: string,
    firstName: string,
    lastName: string,
    phone?: string
  }
  ```
- **Response:**
  ```typescript
  {
    success: boolean,
    user: { ... }
  }
  ```

### 4.2 Member Endpoints

#### GET `/api/member/profile`
- **Purpose:** Get user profile with additional data
- **Auth:** Required
- **Response:**
  ```typescript
  {
    id: string,
    email: string,
    firstName: string,
    lastName: string,
    phone: string | null,
    role: string,
    tokenBalance: number,
    isActive: boolean,
    upcomingRsvps: number,
    profileComplete: boolean
  }
  ```

#### PATCH `/api/member/profile`
- **Purpose:** Update user profile
- **Auth:** Required
- **Body:**
  ```typescript
  {
    firstName?: string,
    lastName?: string,
    phone?: string
  }
  ```

#### GET `/api/member/tokens`
- **Purpose:** Get token balance and transaction history
- **Auth:** Required
- **Response:**
  ```typescript
  {
    balance: number,
    transactions: Array<{
      id: string,
      type: "CREDIT" | "DEBIT",
      amount: number,
      description: string | null,
      createdAt: Timestamp
    }>
  }
  ```

#### GET `/api/member/rsvps`
- **Purpose:** Get user's RSVPs
- **Auth:** Required
- **Query Params:** `status?`, `limit?`
- **Response:**
  ```typescript
  {
    rsvps: Array<{
      id: string,
      eventId: string,
      event: Event,
      status: string,
      waitlistPosition: number | null,
      createdAt: Timestamp
    }>
  }
  ```

#### POST `/api/member/rsvps`
- **Purpose:** Create RSVP for event
- **Auth:** Required
- **Body:**
  ```typescript
  {
    eventId: string
  }
  ```
- **Logic:**
  1. Check user has sufficient tokens
  2. Check event capacity
  3. Create RSVP (CONFIRMED or WAITLISTED)
  4. Deduct tokens if CONFIRMED
  5. Create transaction record

#### GET `/api/member/calendar`
- **Purpose:** Get user's calendar events
- **Auth:** Required
- **Query Params:** `startDate?`, `endDate?`
- **Response:**
  ```typescript
  {
    events: Array<Event & { rsvpStatus: string }>
  }
  ```

### 4.3 Admin Endpoints

#### GET `/api/admin/events`
- **Purpose:** Get all events (admin view)
- **Auth:** Required (ADMIN or SUPER_ADMIN)
- **Query Params:** `category?`, `status?`, `sportId?`, `limit?`
  - `category`: "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS" (optional)
- **Response:**
  ```typescript
  {
    events: Array<Event>
  }
  ```

#### POST `/api/admin/events`
- **Purpose:** Create new event
- **Auth:** Required (ADMIN or SUPER_ADMIN)
- **Body:** Event creation schema
  ```typescript
  {
    title: string,
    description?: string,
    category: "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS",
    sportId: string,
    locationId?: string,
    seriesId?: string,
    startTime: Timestamp,
    endTime: Timestamp,
    capacity: number,
    tokensRequired?: number,
    genderPolicy?: "ALL" | "MALE_ONLY" | "FEMALE_ONLY",
    visibility?: "PUBLIC" | "MEMBERS_ONLY",
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED"
  }
  ```
- **Response:**
  ```typescript
  {
    id: string,
    ...event
  }
  ```

#### PATCH `/api/admin/events/[id]`
- **Purpose:** Update event
- **Auth:** Required (ADMIN or SUPER_ADMIN)
- **Body:** Partial event data (all fields optional, including `category`)
  ```typescript
  {
    title?: string,
    description?: string,
    category?: "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS",
    sportId?: string,
    locationId?: string,
    startTime?: Timestamp,
    endTime?: Timestamp,
    capacity?: number,
    tokensRequired?: number,
    genderPolicy?: "ALL" | "MALE_ONLY" | "FEMALE_ONLY",
    visibility?: "PUBLIC" | "MEMBERS_ONLY",
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED"
  }
  ```

#### DELETE `/api/admin/events/[id]`
- **Purpose:** Soft delete event (mark as CANCELLED)
- **Auth:** Required (ADMIN or SUPER_ADMIN)

#### GET `/api/admin/stats`
- **Purpose:** Get admin dashboard statistics
- **Auth:** Required (ADMIN or SUPER_ADMIN)
- **Response:**
  ```typescript
  {
    totalEvents: number,
    upcomingEvents: number,
    totalRsvps: number,
    activeMembers: number
  }
  ```

### 4.4 Super Admin Endpoints

#### GET `/api/superadmin/users`
- **Purpose:** Get all users
- **Auth:** Required (SUPER_ADMIN)
- **Response:**
  ```typescript
  {
    users: Array<User>
  }
  ```

#### PATCH `/api/superadmin/users/[id]/role`
- **Purpose:** Change user role
- **Auth:** Required (SUPER_ADMIN)
- **Body:**
  ```typescript
  {
    role: "MEMBER" | "ADMIN" | "SUPER_ADMIN"
  }
  ```

#### PATCH `/api/superadmin/users/[id]/status`
- **Purpose:** Activate/deactivate user
- **Auth:** Required (SUPER_ADMIN)
- **Body:**
  ```typescript
  {
    isActive: boolean
  }
  ```

#### POST `/api/superadmin/tokens`
- **Purpose:** Add tokens to user
- **Auth:** Required (SUPER_ADMIN)
- **Body:**
  ```typescript
  {
    userId: string,
    amount: number,
    description?: string
  }
  ```

#### DELETE `/api/superadmin/tokens`
- **Purpose:** Remove tokens from user
- **Auth:** Required (SUPER_ADMIN)
- **Body:**
  ```typescript
  {
    userId: string,
    amount: number,
    description?: string
  }
  ```

#### GET `/api/superadmin/tokens`
- **Purpose:** Get token transactions
- **Auth:** Required (SUPER_ADMIN)
- **Query Params:** `userId?`, `limit?`

#### GET `/api/superadmin/purchases`
- **Purpose:** Get all purchases
- **Auth:** Required (SUPER_ADMIN)
- **Query Params:** `userId?`, `status?`, `limit?`

#### PATCH `/api/superadmin/purchases`
- **Purpose:** Update purchase status
- **Auth:** Required (SUPER_ADMIN)
- **Body:**
  ```typescript
  {
    purchaseId: string,
    status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED"
  }
  ```
- **Logic:** If status changes to COMPLETED, automatically credit tokens

### 4.5 Public Endpoints

#### GET `/api/events`
- **Purpose:** Get published public events
- **Auth:** Not required
- **Query Params:** `category?`, `sportId?`, `genderPolicy?`, `startDate?`, `limit?`
  - `category`: "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS" (optional)
- **Response:**
  ```typescript
  {
    events: Array<Event>
  }
  ```

#### GET `/api/news`
- **Purpose:** Get published news posts
- **Auth:** Not required
- **Query Params:** `limit?`, `offset?`
- **Response:**
  ```typescript
  {
    posts: Array<NewsPost>
  }
  ```

#### POST `/api/contact`
- **Purpose:** Submit contact form
- **Auth:** Not required
- **Body:**
  ```typescript
  {
    name: string,
    email: string,
    subject: string,
    message: string
  }
  ```

---

## 5. Authentication & Authorization

### 5.1 Authentication Flow

1. **Client-Side:**
   - User clicks "Sign in with Google"
   - Firebase `signInWithRedirect` called
   - User redirected to Google OAuth
   - Google redirects back with auth result
   - `getRedirectResult` processes the result
   - `onAuthStateChanged` listener fires

2. **Backend Verification:**
   - Client gets Firebase ID token
   - Token sent in `Authorization: Bearer <token>` header
   - Server verifies token with Firebase Admin SDK
   - Server fetches user data from Firestore
   - Returns user data or error

3. **Registration Flow:**
   - If user doesn't exist in Firestore (404 from `/api/auth/me`)
   - Client calls `/api/auth/register` with user info
   - Server creates user document in Firestore
   - Server creates entry in `user_roles` collection
   - Default role: "MEMBER"

### 5.2 Authorization Middleware

#### Role Verification Pattern
```typescript
async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

async function requireAdmin(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return null;
  
  const userDoc = await adminFirestore.collection("users").doc(decoded.uid).get();
  const userData = userDoc.data();
  
  if (userData?.role !== "ADMIN" && userData?.role !== "SUPER_ADMIN") {
    return null;
  }
  
  return { uid: decoded.uid, userData };
}

async function requireSuperAdmin(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return null;
  
  const userDoc = await adminFirestore.collection("users").doc(decoded.uid).get();
  const userData = userDoc.data();
  
  if (userData?.role !== "SUPER_ADMIN") {
    return null;
  }
  
  return { uid: decoded.uid, userData };
}
```

### 5.3 Route Protection

#### Frontend Route Protection
- Member routes (`/member/*`): Check authentication, redirect to `/login` if not authenticated
- Admin routes (`/admin/*`): Check authentication AND role (ADMIN or SUPER_ADMIN)
- Super admin routes (`/superadmin/*`): Check authentication AND role (SUPER_ADMIN only)

#### Implementation Pattern
```typescript
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      router.replace("/login");
      return;
    }
    
    const token = await user.getIdToken();
    const res = await fetch("/api/member/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (res.status === 403) {
      router.replace("/member"); // Not authorized for this role
      return;
    }
    
    // Load page data...
  });
  
  return () => unsubscribe();
}, [router]);
```

---

## 6. Key Algorithms & Logic

### 6.1 RSVP Logic

```typescript
async function createRSVP(eventId: string, userId: string) {
  // 1. Get event
  const event = await getEvent(eventId);
  
  // 2. Check user has sufficient tokens
  const user = await getUser(userId);
  if (user.tokenBalance < event.tokensRequired) {
    throw new Error("Insufficient tokens");
  }
  
  // 3. Count confirmed RSVPs
  const confirmedCount = await countConfirmedRSVPs(eventId);
  
  // 4. Determine status
  let status = "CONFIRMED";
  let waitlistPosition = null;
  
  if (confirmedCount >= event.capacity) {
    status = "WAITLISTED";
    const waitlistCount = await countWaitlistedRSVPs(eventId);
    waitlistPosition = waitlistCount + 1;
  }
  
  // 5. Create RSVP
  const rsvpId = `${eventId}_${userId}`;
  await createRSVPRecord({
    id: rsvpId,
    eventId,
    userId,
    status,
    waitlistPosition,
    createdAt: new Date()
  });
  
  // 6. Deduct tokens if confirmed
  if (status === "CONFIRMED") {
    await deductTokens(userId, event.tokensRequired, `RSVP to ${event.title}`);
  }
  
  return { status, waitlistPosition };
}
```

### 6.2 Waitlist Promotion Logic

```typescript
async function promoteWaitlistedUser(eventId: string) {
  // 1. Get next waitlisted user (by position)
  const nextUser = await getNextWaitlistedUser(eventId);
  if (!nextUser) return;
  
  // 2. Update RSVP status to CONFIRMED
  await updateRSVP(nextUser.rsvpId, {
    status: "CONFIRMED",
    waitlistPosition: null
  });
  
  // 3. Deduct tokens
  const event = await getEvent(eventId);
  await deductTokens(nextUser.userId, event.tokensRequired, `Promoted from waitlist: ${event.title}`);
  
  // 4. Update remaining waitlist positions
  await updateWaitlistPositions(eventId);
  
  // 5. Notify user (future: email/SMS)
}
```

### 6.3 Token Balance Calculation

```typescript
async function calculateTokenBalance(userId: string): Promise<number> {
  // Option 1: Sum from ledger (accurate but slower)
  const transactions = await getTokenTransactions(userId);
  const balance = transactions.reduce((sum, tx) => {
    return sum + (tx.type === "CREDIT" ? tx.amount : -tx.amount);
  }, 0);
  
  // Option 2: Use cached balance (faster but may need reconciliation)
  const user = await getUser(userId);
  return user.tokenBalance || 0;
  
  // Best practice: Use cached balance, reconcile periodically
}
```

### 6.4 Purchase Status Update Logic

```typescript
async function updatePurchaseStatus(purchaseId: string, newStatus: string) {
  const purchase = await getPurchase(purchaseId);
  const oldStatus = purchase.status;
  
  // If changing from PENDING to COMPLETED, credit tokens
  if (oldStatus === "PENDING" && newStatus === "COMPLETED") {
    // Update purchase status
    await updatePurchase(purchaseId, { status: newStatus });
    
    // Credit tokens to user
    await creditTokens(
      purchase.userId,
      purchase.tokens,
      `Purchase ${purchaseId} completed`
    );
    
    // Log in audit
    await logAudit({
      action: "PURCHASE_STATUS_CHANGED",
      entityType: "PURCHASE",
      entityId: purchaseId,
      details: { oldStatus, newStatus, tokens: purchase.tokens }
    });
  } else {
    // Just update status
    await updatePurchase(purchaseId, { status: newStatus });
  }
}
```

---

## 7. UI/UX Patterns

### 7.1 Component Patterns

#### Dashboard Layout Pattern
```typescript
<DashboardLayout type="member|admin|superadmin">
  {/* Page content */}
</DashboardLayout>
```

#### Event Category Filter Pattern
```typescript
<Select value={selectedCategory} onValueChange={setSelectedCategory}>
  <SelectTrigger>
    <SelectValue placeholder="All Events" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Events</SelectItem>
    <SelectItem value="WEEKLY_SPORTS">Weekly Sports</SelectItem>
    <SelectItem value="MONTHLY_EVENTS">Monthly Events</SelectItem>
    <SelectItem value="FEATURED_EVENTS">Featured Events</SelectItem>
  </SelectContent>
</Select>
```

#### Sidebar Navigation Pattern
- Fixed sidebar on desktop
- Collapsible mobile menu
- Active route highlighting
- Role-based menu items

#### Form Validation Pattern
```typescript
const schema = z.object({
  firstName: z.string().min(1).max(100),
  email: z.string().email()
});

const form = useForm({
  resolver: zodResolver(schema)
});
```

#### Event Creation/Edit Form Pattern
```typescript
const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.enum(["WEEKLY_SPORTS", "MONTHLY_EVENTS", "FEATURED_EVENTS"]),
  sportId: z.string().min(1),
  locationId: z.string().optional(),
  startTime: z.date(),
  endTime: z.date(),
  capacity: z.number().int().positive(),
  tokensRequired: z.number().int().nonnegative().default(1),
  genderPolicy: z.enum(["ALL", "MALE_ONLY", "FEMALE_ONLY"]).default("ALL"),
  visibility: z.enum(["PUBLIC", "MEMBERS_ONLY"]).default("PUBLIC"),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).default("DRAFT")
});
```

### 7.2 Theme System

#### Color Variables (Tailwind)
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 222 47% 11%; /* Dark blue */
  --accent: /* Gold/Yellow */;
}

.dark {
  --background: 222 47% 11%;
  --foreground: 0 0% 100%;
  --primary: /* Gold/Yellow */;
}
```

#### Theme Toggle
- Small toggle button in navbar (14px)
- Uses `next-themes` for persistence
- Smooth transitions

### 7.3 Responsive Design

#### Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

#### Mobile Patterns
- Hamburger menu for navigation
- Stacked layouts
- Touch-friendly button sizes
- Bottom sheet modals

---

## 8. Error Handling

### 8.1 Error Types

#### Authentication Errors
- `401 Unauthorized`: Invalid or expired token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User not found

#### Validation Errors
- `400 Bad Request`: Invalid input data
- Zod validation errors with field-level messages

#### Server Errors
- `500 Internal Server Error`: Unexpected errors
- Firebase connection errors
- Database errors

### 8.2 Error Handling Pattern

```typescript
try {
  const result = await someOperation();
  return NextResponse.json(result);
} catch (error: any) {
  console.error("Operation error:", error);
  
  // Check for specific error types
  if (error?.message?.includes("FIREBASE_SERVICE_ACCOUNT_KEY")) {
    return NextResponse.json(
      { error: "Firebase not configured", message: error.message },
      { status: 500 }
    );
  }
  
  return NextResponse.json(
    { error: "Operation failed", message: error?.message || "Unknown error" },
    { status: 500 }
  );
}
```

### 8.3 Client-Side Error Handling

```typescript
try {
  const res = await fetch("/api/endpoint");
  if (!res.ok) {
    const error = await res.json();
    toast({
      title: "Error",
      description: error.message || "Something went wrong",
      variant: "destructive"
    });
    return;
  }
  // Handle success
} catch (error) {
  toast({
    title: "Network Error",
    description: "Please check your connection",
    variant: "destructive"
  });
}
```

---

## 9. Security Considerations

### 9.1 Input Validation
- All API endpoints validate input with Zod schemas
- Sanitize user input
- Type checking with TypeScript

### 9.2 Authentication Security
- JWT tokens with expiration
- Token verification on every request
- Secure token storage (HttpOnly cookies in future)

### 9.3 Authorization Security
- Role checks on both frontend and backend
- Never trust client-side role checks alone
- Audit logging for sensitive operations

### 9.4 Data Security
- Firestore security rules (to be implemented)
- Encrypted connections (HTTPS)
- No sensitive data in client-side code

---

## 10. Performance Optimization

### 10.1 Database Queries
- Use indexes for all queries
- Limit query results with pagination
- Cache frequently accessed data

### 10.2 Frontend Optimization
- Code splitting with Next.js
- Image optimization with Next.js Image
- Lazy loading for heavy components
- Memoization for expensive computations

### 10.3 API Optimization
- Batch operations where possible
- Use Firestore transactions for atomic operations
- Minimize API calls with data aggregation

---

## 11. Deployment & Environment

### 11.1 Environment Variables

#### Required
```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

#### Optional
```bash
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 11.2 Build & Deploy

#### Development
```bash
npm run dev
```

#### Production Build
```bash
npm run build
npm start
```

### 11.3 Firebase Setup

1. Create Firebase project
2. Enable Authentication (Google provider)
3. Create Firestore database
4. Generate service account key
5. Set up environment variables
6. Deploy Firestore indexes
7. Configure Firestore security rules

---

## 12. Testing Strategy

### 12.1 Unit Tests
- Utility functions
- Validation schemas
- Business logic functions

### 12.2 Integration Tests
- API endpoint testing
- Database operations
- Authentication flows

### 12.3 E2E Tests
- User registration flow
- RSVP flow
- Admin event creation
- Super admin user management

---

## 13. Monitoring & Logging

### 13.1 Logging
- Console logging for development
- Structured logging for production
- Error tracking (Sentry, etc.)

### 13.2 Monitoring
- API response times
- Error rates
- User activity
- System health

### 13.3 Audit Trail
- All sensitive operations logged in `audit_log`
- User actions tracked
- System changes recorded

---

## 14. Future Enhancements

### 14.1 Planned Features
- Email notifications
- SMS notifications
- QR code check-in
- Mobile app
- Social features
- Advanced analytics

### 14.2 Technical Improvements
- Firestore security rules
- Caching layer (Redis)
- CDN for static assets
- GraphQL API (optional)
- Microservices architecture (if scaling)

---

**Document End**
