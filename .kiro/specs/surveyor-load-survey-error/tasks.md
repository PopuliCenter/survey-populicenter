# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Backend Error Key Not Extracted
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — API error responses where `err.response.data.error` is a non-empty string and `err.response.data.message` is undefined
  - Create test file `frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
  - Use fast-check to generate arbitrary non-empty error message strings
  - For each generated error string, mock `api.post('/responses/start')` to reject with `{ response: { data: { error: generatedString } } }`
  - Render `SurveyForm` inside `MemoryRouter` and assert the generated error string appears in the document (not the generic fallback "Gagal memuat survei.")
  - Also test photo upload path: mock `api.post('/upload/photo')` to reject with `{ response: { data: { error: generatedString } } }` and assert the error string appears (not "Gagal mengunggah foto. Coba lagi.")
  - Use the same mock setup patterns from existing `SurveyForm.test.jsx` (mock api, useGeolocation, useSkipLogic, useSyncManager, offlineDB, useAudioRecorder, usePhotoCapture, useSignaturePad, presentation components)
  - Run test on UNFIXED code with `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists because `err.response?.data?.message` returns `undefined` when backend sends `{ error: '...' }`)
  - Document counterexamples found (e.g., "For error string 'Kuota pengisian survei Anda sudah tercapai', component displays 'Gagal memuat survei.' instead")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Fallback Chain for Non-Bug-Condition Inputs
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: when `err.response.data` has only a `message` key (e.g., `{ message: 'some error' }`), the component displays that message
  - Observe on UNFIXED code: when `err.response.data` has neither `error` nor `message` key (e.g., `{ code: 123 }`), the component displays the generic fallback "Gagal memuat survei."
  - Observe on UNFIXED code: when `err.response` is undefined (network error), the component displays the generic fallback "Gagal memuat survei."
  - Add preservation tests to the same file `frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
  - Use fast-check to generate arbitrary error response objects where `isBugCondition` is false (i.e., `err.response.data.error` is undefined/null/empty and `err.response.data.message` may or may not be present)
  - Property: for all non-bug-condition error responses, the displayed error message equals `err.response?.data?.message || 'Gagal memuat survei.'`
  - Verify test passes on UNFIXED code with `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [x] 3. Fix for backend error key not extracted in SurveyForm.jsx

  - [x] 3.1 Implement the fix
    - In `frontend/src/surveyor/pages/SurveyForm.jsx`, change the survey loading error extraction (line ~718):
      - FROM: `setLoadingError(err.response?.data?.message || 'Gagal memuat survei.');`
      - TO: `setLoadingError(err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.');`
    - In `frontend/src/surveyor/pages/SurveyForm.jsx`, change the photo upload error extraction (line ~826):
      - FROM: `setSubmitError(err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.');`
      - TO: `setSubmitError(err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.');`
    - _Bug_Condition: isBugCondition(input) where err.response.data.error is a non-empty string AND err.response.data.message is undefined_
    - _Expected_Behavior: extractErrorMessage returns err.response.data.error when present, falling back to err.response.data.message, then to generic fallback_
    - _Preservation: Non-bug-condition inputs (no error key, only message key, no response) continue to produce the same displayed message as before_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Backend Error Key Correctly Extracted
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (error string from `err.response.data.error` is displayed)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Fallback Chain for Non-Bug-Condition Inputs
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - Run: `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite: `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyFormErrorExtraction.property.test.jsx`
  - Verify both Property 1 (bug condition / expected behavior) and Property 2 (preservation) pass
  - Run existing SurveyForm tests to confirm no regressions: `npx vitest run frontend/src/surveyor/pages/__tests__/SurveyForm.test.jsx`
  - Ensure all tests pass, ask the user if questions arise.
