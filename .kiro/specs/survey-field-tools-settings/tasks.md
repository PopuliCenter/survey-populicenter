# Implementation Plan: Survey Field Tools Settings

## Overview

Implement per-survey field tools configuration (signature, audio, photo, GPS) with modes `required`, `optional`, or `disabled`. This involves a database migration, backend model/validation/route updates, and frontend UI changes for both admin (SurveyBuilder) and surveyor (SurveyForm) sides. Tasks are ordered so each step builds on the previous, starting with the data layer and working up to the UI.

## Tasks

- [x] 1. Database migration and model update
  - [x] 1.1 Create migration `20240109000001-add-field-tools-settings.js`
    - Add `field_tools_settings` JSONB column to `surveys` table with default `{"signature_mode":"required","audio_mode":"required","photo_mode":"required","gps_mode":"required"}`
    - Update all existing surveys with the same default value
    - Include `down` migration to remove the column
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.2 Update Survey model (`backend/src/models/Survey.js`)
    - Add `field_tools_settings` field with `DataTypes.JSONB`, default value, and `allowNull: false`
    - Add custom validate function that checks each mode is one of `required`, `optional`, `disabled`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Field tools validation utility and route updates
  - [x] 2.1 Create `backend/src/utils/fieldToolsValidator.js`
    - Implement `validateFieldToolsSettings(settings)` — validates the settings object structure and mode values
    - Implement `validateFieldToolsSubmission(submissionData, settings)` — validates submission data against survey settings
    - Implement `getDefaultFieldToolsSettings()` — returns the default settings object
    - Export all three functions
    - _Requirements: 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.2 Write property test: Settings round-trip preservation
    - **Property 1: Settings round-trip preservation**
    - Generate random valid `field_tools_settings` objects, PUT to update survey, GET to retrieve, verify exact match
    - **Validates: Requirements 1.1, 3.1**

  - [ ]* 2.3 Write property test: Mode validation rejects invalid values
    - **Property 2: Mode validation rejects invalid values**
    - Generate random strings not in `{required, optional, disabled}`, verify rejection; generate valid combinations, verify acceptance
    - **Validates: Requirements 1.3, 1.4, 3.4**

  - [x] 2.4 Update survey routes (`backend/src/routes/surveys.js`)
    - **GET `/surveys/:id`**: Add `field_tools_settings` to response attributes
    - **PUT `/surveys/:id`**: Accept `field_tools_settings` from request body, validate with `validateFieldToolsSettings()`, save to model; return 422 on invalid input
    - **POST `/surveys`**: New surveys automatically get default `field_tools_settings` (handled by model default)
    - **POST `/surveys/:id/clone`**: Copy `field_tools_settings` from source survey to cloned survey
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 2.5 Write property test: Clone preserves field tools settings
    - **Property 6: Clone preserves field tools settings**
    - Generate random valid `field_tools_settings`, set on source survey, clone, verify cloned survey has identical settings
    - **Validates: Requirements 3.5**

- [x] 3. Response submission validation
  - [x] 3.1 Update response routes (`backend/src/routes/responses.js`)
    - In POST `/responses/submit`, after fetching the survey, load `field_tools_settings`
    - Call `validateFieldToolsSubmission()` with submission data and settings before saving
    - Return HTTP 422 with appropriate error messages when required field tools data is missing
    - For `disabled` field tools, ignore their data (do not reject)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 3.2 Write property test: Required field tools enforcement
    - **Property 3: Required field tools enforcement**
    - Generate random required tool + missing data combinations, verify HTTP 422 rejection with correct error message
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ]* 3.3 Write property test: Optional field tools acceptance
    - **Property 4: Optional field tools acceptance**
    - Generate random optional tool + present/absent data combinations, verify submission is accepted
    - **Validates: Requirements 4.4, 4.5, 4.6, 4.7, 5.5**

  - [ ]* 3.4 Write property test: Disabled field tools ignored
    - **Property 5: Disabled field tools ignored**
    - Generate random disabled tool + data combinations, verify submission is accepted without validation errors
    - **Validates: Requirements 5.6**

- [x] 4. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. SurveyBuilder admin UI
  - [x] 5.1 Add "Pengaturan Field Tools" section to `frontend/src/pages/SurveyBuilder.jsx`
    - Add state for `fieldToolsSettings` initialized from survey data or defaults
    - Render a section below the date picker with four field tools (Tanda Tangan, Rekaman Audio, Pengambilan Foto, Lokasi GPS)
    - Each field tool has 3 radio buttons: Wajib, Opsional, Nonaktif
    - Add "Simpan Pengaturan" button that sends PUT `/surveys/:id` with `field_tools_settings`
    - Display success/error feedback on save
    - When loading an existing survey, populate radio buttons from `field_tools_settings`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.2 Write unit tests for SurveyBuilder field tools section
    - Test that the section renders with 4 field tools and 3 options each
    - Test that saved settings are displayed correctly on load
    - Test that save button triggers PUT request with correct payload
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. SurveyForm surveyor-side updates
  - [x] 6.1 Update `frontend/src/surveyor/pages/SurveyForm.jsx` for field tools display
    - Read `field_tools_settings` from survey data (online or cached)
    - Hide field tool components when mode is `disabled`
    - Show "(Opsional)" label when mode is `optional`
    - Show "(Wajib)" label when mode is `required`
    - Skip signature required validation when `signature_mode` is not `required`
    - Skip audio/photo/GPS required validation for non-required modes
    - Adjust submission payload — do not send data for `disabled` field tools
    - Fall back to default `required` for all tools if `field_tools_settings` is missing (backward compatibility)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3_

  - [ ]* 6.2 Write unit tests for SurveyForm field tools behavior
    - Test that disabled field tools are hidden
    - Test that optional field tools show "(Opsional)" label
    - Test that required field tools show "(Wajib)" label
    - Test that form submits without optional field tool data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- Offline support (Requirement 7) is handled by existing cache mechanism — `field_tools_settings` is included in the survey object cached by `cacheSurvey()`, so no structural changes to `offlineDB.js` are needed
