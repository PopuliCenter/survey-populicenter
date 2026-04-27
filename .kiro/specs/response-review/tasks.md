# Implementation Plan: Response Review

## Overview

This plan implements the response review/quality control feature across four layers: database migration, backend API (model + routes), audit logging, and frontend UI. Each task builds incrementally — starting with the data layer, then backend logic, then frontend components — so that every step produces working, testable code.

## Tasks

- [x] 1. Create database migration for review columns
  - Create migration file `backend/src/migrations/20240107000001-add-response-review-columns.js`
  - Add `review_status` column: VARCHAR(20), NOT NULL, default `'unreviewed'`, CHECK constraint for `('unreviewed','flagged','verified')`
  - Add `review_note` column: TEXT, nullable
  - Add `reviewed_by` column: UUID, nullable, FK referencing `users.id` (ON DELETE SET NULL)
  - Add `reviewed_at` column: TIMESTAMPTZ, nullable
  - Add B-tree index `idx_responses_review_status` on `review_status`
  - Implement `down` method to remove columns and index
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Update Response model and associations
  - [x] 2.1 Add review fields to Response model
    - Add `review_status`, `review_note`, `reviewed_by`, `reviewed_at` field definitions to `backend/src/models/Response.js`
    - Include `isIn` validation for `review_status` matching `['unreviewed', 'flagged', 'verified']`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 Add reviewer association in model index
    - Add `User.hasMany(Response, { foreignKey: 'reviewed_by', as: 'reviewedResponses' })` to `backend/src/models/index.js`
    - Add `Response.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' })` to `backend/src/models/index.js`
    - _Requirements: 1.3_

- [x] 3. Implement PATCH /responses/:id/review endpoint
  - [x] 3.1 Add review update route handler
    - Add `PATCH /:id/review` route in `backend/src/routes/responses.js`
    - Guard with `authMiddleware` and `requireRole(['admin', 'supervisor'])`
    - Validate `review_status` is one of `['unreviewed', 'flagged', 'verified']`, return 400 if invalid
    - Find response by ID, return 404 if not found
    - Capture old review state (`review_status`, `review_note`) before update
    - Update `review_status`, `review_note`, `reviewed_by = req.user.id`, `reviewed_at = new Date()`
    - Call `createAuditLog()` with action `'REVIEW_RESPONSE'`, entity_type `'response'`, entity_id, old_value, new_value
    - Return updated review fields including `reviewer_name` (fetched from User model)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2_

  - [ ]* 3.2 Write property test: Review update sets all fields correctly
    - **Property 1: Review update sets all fields correctly**
    - **Validates: Requirements 2.1, 2.4, 2.7**

  - [ ]* 3.3 Write property test: Review status validation
    - **Property 2: Review status validation**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 3.4 Write property test: Audit log creation on review transition
    - **Property 3: Audit log creation on review transition**
    - **Validates: Requirements 2.5**

  - [ ]* 3.5 Write property test: Review endpoint authorization by role
    - **Property 4: Review endpoint authorization by role**
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 3.6 Write unit tests for PATCH /responses/:id/review
    - Test response not found returns 404
    - Test invalid review_status returns 400
    - Test review_note null/empty accepted
    - Test viewer gets 403
    - Test surveyor gets 403
    - Add tests to `backend/tests/unit/responseReview.test.js`
    - _Requirements: 2.3, 2.6, 2.7, 3.1, 3.2_

- [x] 4. Modify GET /responses and GET /responses/:id for review fields
  - [x] 4.1 Add review field visibility by role
    - In `GET /responses`, include `review_status`, `review_note`, `reviewed_by`, `reviewed_at`, `reviewer_name` in response for admin/supervisor/viewer
    - In `GET /responses`, exclude review fields for surveyor role
    - In `GET /responses/:id`, include review fields and reviewer info for admin/supervisor/viewer
    - In `GET /responses/:id`, exclude review fields for surveyor role
    - Include `reviewer` association (User model) in queries for non-surveyor roles
    - _Requirements: 3.3, 3.4_

  - [x] 4.2 Add review_status filter to GET /responses
    - Accept `review_status` query parameter on `GET /responses`
    - Validate filter value against `['unreviewed', 'flagged', 'verified']`; ignore if invalid
    - Apply filter to Sequelize `where` clause when valid
    - Only apply filter for non-surveyor roles
    - When no `review_status` param, return all responses (no filter)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.3 Write property test: Review field visibility by role
    - **Property 5: Review field visibility by role**
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 4.4 Write property test: Review status filter returns only matching responses
    - **Property 6: Review status filter returns only matching responses**
    - **Validates: Requirements 4.1**

  - [ ]* 4.5 Write unit tests for GET review modifications
    - Test invalid filter value is ignored (returns all)
    - Test no filter returns all responses
    - Test admin sees review fields
    - Test surveyor does not see review fields
    - Add tests to `backend/tests/unit/responseReview.test.js`
    - _Requirements: 3.3, 3.4, 4.3, 4.4_

- [x] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create ReviewStatusBadge frontend component
  - [x] 6.1 Implement ReviewStatusBadge component
    - Create `frontend/src/components/ReviewStatusBadge.jsx`
    - Render colored badge: red for `flagged` ("Flagged"), green for `verified` ("Verified"), gray for `unreviewed` ("Unreviewed")
    - Accept `status` prop
    - Follow existing badge pattern from `GeoStatusBadge` in Responses.jsx
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 6.2 Write unit tests for ReviewStatusBadge
    - Test correct color classes for each status value
    - Test correct label text for each status value
    - Add tests to `frontend/src/components/__tests__/ReviewStatusBadge.test.jsx`
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 7. Update Responses.jsx with review column and filter
  - Add "Status Review" column to the responses table (after Geolokasi column)
  - Render `ReviewStatusBadge` in the new column
  - Add "Status Review" dropdown filter to the filter card with options: Semua, Unreviewed, Flagged, Verified
  - Send `review_status` query parameter to backend when filter is selected
  - Only show review column and filter for admin/supervisor/viewer roles (read user role from auth context or token)
  - _Requirements: 5.1, 5.5, 5.6_

- [x] 8. Update ResponseDetail.jsx with review panel
  - [x] 8.1 Add review panel for admin/supervisor
    - Add a review panel section after the metadata card in `frontend/src/pages/ResponseDetail.jsx`
    - Include dropdown for review_status (unreviewed, flagged, verified)
    - Include textarea for review_note
    - Display reviewer name and reviewed_at timestamp when available
    - Add "Simpan Review" button that sends `PATCH /responses/:id/review`
    - Show success notification on save, update badge display
    - Show error message from backend on failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.2 Handle role-based visibility of review panel
    - Show full editable review panel for admin and supervisor
    - Show read-only review status display for viewer
    - Hide review panel entirely for surveyor
    - _Requirements: 6.1, 6.7_

  - [ ]* 8.3 Write unit tests for review panel
    - Test panel visible for admin/supervisor
    - Test panel hidden for surveyor
    - Test panel displays existing review data
    - Test panel submits PATCH request
    - Test success/error notifications
    - Add tests to `frontend/src/components/__tests__/ReviewPanel.test.jsx`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–6)
- Unit tests validate specific examples and edge cases
- All property tests go in `backend/tests/properties/responseReview.property.test.js`
- All backend unit tests go in `backend/tests/unit/responseReview.test.js`
- Frontend tests follow existing patterns in `frontend/src/components/__tests__/`
