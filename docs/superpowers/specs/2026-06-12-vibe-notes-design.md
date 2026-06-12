# Vibe Notes Design

Date: 2026-06-12
Status: Approved direction, pending written-spec review

## Product Goal

Build a calm, Apple Notes-inspired web application for personal notes. Users can
sign in, edit notes across devices, and attach images, recordings, and videos.
The first release should feel complete for daily use while keeping the data model
and interface small enough to implement and verify well.

## MVP Scope

The first release includes:

- Email and password registration, sign-in, sign-out, and session restoration.
- Create, edit, duplicate, pin, search, soft-delete, restore, and permanently
  delete notes.
- Folders: All Notes, Pinned, Recently Deleted, and user-created folders.
- Rich-text editing with headings, paragraphs, bold, italic, underline, links,
  bulleted lists, numbered lists, checklists, quotes, and code blocks.
- Automatic local saving and cloud synchronization.
- Image, audio, and video upload with inline preview or playback.
- Browser audio recording through the microphone.
- Responsive desktop, tablet, and mobile layouts.
- Light mode, dark mode, and system-theme detection.
- Installable PWA behavior and basic offline editing.

Shared notes, simultaneous collaborative editing, handwritten drawing, OCR,
speech-to-text, end-to-end encryption, and native mobile applications are not
part of the MVP.

## Visual Direction

The interface uses a restrained Apple Notes-inspired language rather than a
pixel-for-pixel clone.

- Backgrounds are true white and neutral system grays in light mode, with deep
  charcoal surfaces in dark mode.
- The primary accent is Notes yellow, used for selection, important actions, and
  focus states.
- Typography uses the system font stack, with clear hierarchy and compact UI
  labels.
- Surfaces rely on thin separators and subtle elevation instead of nested cards.
- Controls use familiar line icons, large click targets, and short hover or
  press transitions.
- The editor remains visually quiet so note content is the focal point.

## Information Architecture

### Desktop

The main workspace uses three columns:

1. Folder sidebar, approximately 240 px wide.
2. Note list, approximately 320 px wide.
3. Flexible editor occupying the remaining width.

The sidebar contains account status, a new-note action, system folders, custom
folders, theme controls, and sign-out. The note list contains search, sorting,
note previews, pin indicators, and attachment indicators. The editor contains a
compact toolbar, editable title and body, attachment blocks, and save status.

### Mobile

The columns become a navigation stack:

1. Folder screen.
2. Note-list screen.
3. Editor screen.

Native-feeling back navigation, a bottom action bar, and safe-area padding keep
the interface comfortable on phones. Draft content is saved before navigation.

## Core User Flows

### Authentication

Unauthenticated users see a focused sign-in screen with registration available
in the same surface. Successful authentication restores the last opened folder
and note. Authentication errors remain inline and preserve entered email.

### Note Editing

Creating a note opens an empty editor immediately. The first non-empty line
becomes the default title when the user has not explicitly entered one. Changes
save locally immediately and sync to the cloud after 500 ms of inactivity. The
header reports `Saving`, `Saved`, `Offline`, or `Sync failed`.

### Media

Users can select files or record audio. Upload progress is shown per attachment.
Images render inline; audio and video use native playback controls. A failed
upload remains retryable and does not block text editing.

Default limits:

- Images: JPEG, PNG, WebP, HEIC where the browser can process it; 20 MB each.
- Audio: WebM, MP3, M4A, WAV; 100 MB each.
- Video: MP4, WebM, MOV where supported; 500 MB each.

The application validates type and size before upload. Storage paths are scoped
to the authenticated user.

### Deletion

Deleting a note moves it to Recently Deleted. Notes there can be restored or
permanently deleted. Automatic expiry after 30 days is deferred until a
scheduled backend job is configured; the UI will not claim expiry before then.

## Technical Architecture

### Client

- React, TypeScript, and Vite.
- React Router for authentication and workspace routes.
- TipTap for structured rich-text editing.
- Lucide React for consistent interface icons.
- CSS custom properties and component-scoped CSS for visual tokens.
- TanStack Query for server state and mutation retries.
- IndexedDB through Dexie for drafts, note cache, and pending sync operations.
- Vite PWA plugin for the application shell and installability.

### Backend

- Supabase Auth for email/password authentication.
- Supabase PostgreSQL for notes, folders, attachments, and note revisions.
- Supabase Storage for uploaded media.
- Supabase Realtime for invalidating or refreshing notes changed on another
  active device.
- Row Level Security on every user-owned table and storage policy.

The application remains usable in local demo mode when Supabase environment
variables are absent. Demo mode stores data in IndexedDB and clearly labels
itself as local-only; real account synchronization requires Supabase.

## Data Model

### profiles

- `id uuid primary key references auth.users`
- `display_name text`
- `created_at timestamptz`
- `updated_at timestamptz`

### folders

- `id uuid primary key`
- `user_id uuid not null`
- `name text not null`
- `position integer not null`
- `created_at timestamptz`
- `updated_at timestamptz`

### notes

- `id uuid primary key`
- `user_id uuid not null`
- `folder_id uuid null`
- `title text not null default ''`
- `content jsonb not null`
- `content_text text not null default ''` for search and previews
- `is_pinned boolean not null default false`
- `deleted_at timestamptz null`
- `version integer not null default 1`
- `created_at timestamptz`
- `updated_at timestamptz`

### attachments

- `id uuid primary key`
- `user_id uuid not null`
- `note_id uuid not null`
- `kind text check in ('image', 'audio', 'video')`
- `storage_path text not null`
- `file_name text not null`
- `mime_type text not null`
- `size_bytes bigint not null`
- `duration_seconds numeric null`
- `created_at timestamptz`

### note_revisions

- `id bigint generated always as identity primary key`
- `note_id uuid not null`
- `user_id uuid not null`
- `version integer not null`
- `title text not null`
- `content jsonb not null`
- `created_at timestamptz`

Revision creation is throttled to meaningful checkpoints rather than every
keystroke.

## Synchronization

Every note mutation receives a client operation ID. The client writes the draft
to IndexedDB first, then queues the server mutation. Successful responses update
the local server version and clear the operation.

The MVP conflict policy is last accepted write with revision preservation:

- If the server version matches, update normally.
- If it differs, save the server content as a revision, apply the newer local
  edit, and show a non-blocking conflict notice.
- Realtime events refresh list metadata and unopened notes.
- An actively edited note is never replaced silently.

Queued changes retry when connectivity returns. Text changes and attachment
uploads are separate operations so large media does not block note content.

## Security

- RLS requires `auth.uid() = user_id` for all reads and writes.
- Storage objects use `{user_id}/{note_id}/{attachment_id}/{file_name}` paths.
- Storage policies verify the first path segment matches the authenticated user.
- Rich-text HTML is sanitized before rendering.
- Signed URLs are used for private media.
- Client validation improves feedback but does not replace database and storage
  policies.

## Error Handling

- Authentication, sync, and upload errors use actionable inline messages.
- Failed text sync remains queued and can be retried automatically or manually.
- Failed attachments display retry and remove actions.
- Unsupported browser recording shows file-upload fallback.
- Empty, loading, offline, and missing-note states have explicit UI treatments.
- Permanent deletion requires confirmation.

## Component Boundaries

- `AuthShell`: sign-in, registration, session restoration.
- `AppShell`: responsive navigation and global state.
- `FolderSidebar`: system and custom folders.
- `NoteList`: search, sorting, previews, selection.
- `NoteEditor`: title, TipTap body, toolbar, and save status.
- `AttachmentTray`: upload queue and attachment blocks.
- `AudioRecorder`: permission, recording state, preview, and upload handoff.
- `SyncEngine`: IndexedDB queue, conflict handling, and retry.
- `ThemeProvider`: system, light, and dark theme.

Feature components depend on typed repository interfaces rather than calling
Supabase directly. Supabase and local-demo repositories implement the same
interfaces.

## Testing Strategy

- Unit tests for title derivation, note sorting, sync queue transitions, file
  validation, and conflict handling.
- Component tests for authentication errors, note creation, editor save status,
  deletion and restoration, upload progress, and recording fallback.
- Integration tests against a local or test Supabase project for RLS and storage
  isolation.
- Playwright tests for sign-in, cross-refresh persistence, note editing, search,
  upload, offline recovery, and mobile navigation.
- Visual checks at desktop, tablet, and mobile widths in both themes.

## Acceptance Criteria

- A user can register, sign in, create a note, refresh the browser, and see the
  same content.
- A user can edit on one signed-in browser and observe the updated note on
  another without losing an active draft.
- Images, audio recordings, audio files, and videos upload with progress and can
  be viewed or played later.
- Offline text edits survive refresh and synchronize after reconnection.
- Search returns matches from titles and plain-text note content.
- Deleted notes can be restored or permanently removed.
- One user cannot read another user's rows or storage objects.
- The main workflow is usable at 375 px, 768 px, and 1440 px widths.
- Keyboard navigation and visible focus states cover all primary controls.

## Delivery Sequence

1. Visual concept and design tokens.
2. Local interactive workspace and responsive editor.
3. Supabase schema, authentication, and RLS.
4. Cloud note synchronization and offline queue.
5. Media upload, playback, and audio recording.
6. PWA behavior, accessibility, automated tests, and final visual QA.
