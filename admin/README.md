# OpenPanel Admin CLI

An interactive CLI tool to help manage and lookup OpenPanel organizations, projects, and clients.

## Setup

First, install dependencies:

```bash
cd admin
pnpm install
```

## Usage

Run the CLI from the admin directory:

```bash
pnpm start
```

Or use the convenient shell script from anywhere:

```bash
./admin/cli
```

## Features

The CLI provides 4 focused lookup commands for easier navigation:

### 🏢 Lookup by Organization

Search and view detailed information about an organization.

- Fuzzy search across all organizations by name or ID
- Shows full organization details with all projects, clients, and members

### 📊 Lookup by Project

Search for a specific project and view its organization context.

- Fuzzy search across all projects by name or ID
- Highlights the selected project in the organization view
- Displays: `org → project`

### 🔑 Lookup by Client ID

Search for a specific client and view its full context.

- Fuzzy search across all clients by name or ID
- Highlights the selected client and its project
- Displays: `org → project → client`

### 📧 Lookup by Email

Search for a member by email address.

- Fuzzy search across all member emails
- Shows which organization(s) the member belongs to
- Displays member role (👑 owner, ⭐ admin, 👤 member)

**All lookups display:**
- Organization information (ID, name, subscription status, timezone, event usage)
- Organization members and their roles
- All projects with their settings (domain, CORS, event counts)
- All clients for each project (ID, name, type, credentials)
- Deletion warnings if scheduled

---

### 🗑️ Clear Cache

Clear cache for an organization and all its projects.

- Fuzzy search to find the organization
- Shows organization details and all projects
- Confirms before clearing cache
- Provides organization ID and all project IDs for cache clearing logic

**Use when:**
- You need to invalidate cache after data changes
- Troubleshooting caching issues
- After manual database updates

**Note:** The cache clearing logic needs to be implemented. The command provides the organization and project data structure for you to add your cache clearing calls.

---

### 🔴 Delete Organization

Permanently delete an organization and all its data.

- Fuzzy search to find the organization
- Shows detailed preview of what will be deleted (projects, members, events)
- Requires **3 confirmations**:
  1. Initial confirmation
  2. Type organization name to confirm
  3. Final warning confirmation
- Deletes from both PostgreSQL and ClickHouse

**Use when:**
- Removing organizations that are no longer needed
- Cleaning up test/demo organizations
- Handling deletion requests

**⚠️ WARNING:** This action is PERMANENT and cannot be undone!

**What gets deleted:**
- Organization record
- All projects and their settings
- All clients and credentials
- All events and analytics data (from ClickHouse)
- All member associations
- All dashboards and reports

---

### 🔴 Delete User

Permanently delete a user account and remove them from all organizations.

- Fuzzy search by email or name
- Shows which organizations the user belongs to
- Shows if user created any organizations (won't delete those orgs)
- Requires **3 confirmations**:
  1. Initial confirmation
  2. Type user email to confirm
  3. Final warning confirmation

**Use when:**
- Removing user accounts at user request
- Cleaning up inactive accounts
- Handling GDPR/data deletion requests

**⚠️ WARNING:** This action is PERMANENT and cannot be undone!

**What gets deleted:**
- User account
- All auth sessions and tokens
- All memberships (removed from all orgs)
- All personal data

**What is NOT deleted:**
- Organizations created by the user (only the creator reference is removed)

## Environment Variables

Make sure you have the proper environment variables set up:
- `DATABASE_URL` - PostgreSQL connection string
- `DATABASE_URL_REPLICA` (optional) - Read replica connection string

## Development

The CLI uses:
- **jiti** - Direct TypeScript execution without build step
- **inquirer** - Interactive prompts
- **inquirer-autocomplete-prompt** - Fuzzy search functionality
- **chalk** - Colored terminal output
- **@openpanel/db** - Direct Prisma database access

