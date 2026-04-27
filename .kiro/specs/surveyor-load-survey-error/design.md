# Surveyor Load Survey Error Bugfix Design

## Overview

The `SurveyForm.jsx` component reads `err.response?.data?.message` when handling API errors during survey loading and session start, but the backend consistently returns error messages under the `error` key (e.g., `{ error: 'Kuota pengisian survei Anda sudah tercapai' }`). This mismatch causes the frontend to always resolve `undefined` and fall back to the generic "Gagal memuat survei." message. The fix changes the error extraction in `SurveyForm.jsx` to read `err.response?.data?.error` first, with a fallback chain to `err.response?.data?.message` for backward compatibility, then to the generic fallback string.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when the backend returns an error response with the JSON key `error` and the frontend reads the wrong key (`message`), resulting in `undefined`
- **Property (P)**: The desired behavior — the frontend extracts and displays the actual error string from `err.response.data.error`
- **Preservation**: Existing behaviors that must remain unchanged — successful survey loading, offline mode, and fallback to generic message when neither key is present
- **`SurveyForm.jsx`**: The surveyor-facing React component at `frontend/src/surveyor/pages/SurveyForm.jsx` that loads a survey, starts a response session, and renders the form
- **`loadingError`**: The React state variable in `SurveyForm` that holds the error message displayed to the surveyor when survey loading fails
- **`submitError`**: The React state variable in `SurveyForm` used for photo upload errors, which has the same key mismatch bug

## Bug Details

### Bug Condition

The bug manifests when the backend returns an HTTP error response (4xx/5xx) with the error message stored under the `error` JSON key. The frontend catch block in `SurveyForm.jsx` reads `err.response?.data?.message`, which resolves to `undefined` because the backend never sends a `message` key. The fallback generic string is then used instead of the actual error.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { err: AxiosError }
  OUTPUT: boolean

  RETURN err.response IS NOT null
         AND err.response.data IS NOT null
         AND err.response.data.error IS a non-empty string
         AND err.response.data.message IS undefined
END FUNCTION
```

### Examples

- **Quota exceeded (403)**: Backend returns `{ error: 'Anda tidak memiliki kuota untuk survei ini' }`. Frontend displays "Gagal memuat survei." instead of the quota message.
- **Survey ended (409)**: Backend returns `{ error: 'Survei sudah berakhir' }`. Frontend displays "Gagal memuat survei." instead of the deadline message.
- **Survey inactive (409)**: Backend returns `{ error: 'Survei tidak lagi aktif' }`. Frontend displays "Gagal memuat survei." instead of the status message.
- **Survey not found (404)**: Backend returns `{ error: 'Survei tidak ditemukan' }`. Frontend displays "Gagal memuat survei." instead of the not-found message.
- **Missing survey_id (422)**: Backend returns `{ error: 'survey_id wajib diisi' }`. Frontend displays "Gagal memuat survei." instead of the validation message.
- **Photo upload error (422)**: Backend returns `{ error: 'Format file tidak didukung. Gunakan JPEG, PNG, atau WEBP' }`. Frontend displays "Gagal mengunggah foto. Coba lagi." instead of the format-specific message.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful (2xx) API responses must continue to load and render the survey form correctly
- Offline mode with cached survey data must continue to load from IndexedDB without API calls
- Offline mode without cached data must continue to display the offline-specific error message
- When the backend error response contains neither an `error` nor a `message` key, the generic fallback message must still be used
- The photo upload success path must continue to work correctly
- All other `SurveyForm` functionality (answer handling, validation, submission, skip logic) must remain unchanged

**Scope:**
All inputs that do NOT involve an API error response with an `error` key should be completely unaffected by this fix. This includes:
- Successful API responses (2xx)
- Offline mode paths (both cached and uncached)
- Error responses that happen to include a `message` key (backward compatibility)
- All non-error-handling code paths in `SurveyForm.jsx`

## Hypothesized Root Cause

Based on the code analysis, the root cause is confirmed (not just hypothesized):

1. **Wrong key in error extraction (survey loading)**: Line 718 of `SurveyForm.jsx` reads `err.response?.data?.message` but the backend routes (`responses.js` POST `/start`, `surveys.js` GET `/:id`) consistently return errors as `{ error: '...' }`. The `message` key is never set by the backend, so the expression always evaluates to `undefined`.

2. **Wrong key in error extraction (photo upload)**: Line 826 of `SurveyForm.jsx` has the same pattern — reads `err.response?.data?.message` for photo upload errors, but the upload route (`upload.js`) also returns errors under the `error` key.

3. **Inconsistency with other components**: Other components in the codebase (e.g., `SurveyList.jsx`, `Login.jsx`, `Dashboard.jsx`) already use the correct pattern `err.response?.data?.error || ...`, confirming this is a localized oversight in `SurveyForm.jsx` rather than a systemic issue.

## Correctness Properties

Property 1: Bug Condition - Backend error key is correctly extracted

_For any_ API error response where `err.response.data.error` is a non-empty string and `err.response.data.message` is undefined, the fixed error extraction SHALL return the value of `err.response.data.error` as the displayed error message, not the generic fallback.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Fallback chain for missing keys

_For any_ API error response where `err.response.data.error` is undefined or null, the fixed error extraction SHALL fall back to `err.response.data.message` if present, and then to the generic fallback string, preserving backward compatibility and the existing fallback behavior.

**Validates: Requirements 3.2**

Property 3: Preservation - Successful responses unaffected

_For any_ successful API response (2xx status), the fix SHALL not alter the survey loading behavior — the survey data, questions, and session token SHALL be processed exactly as before.

**Validates: Requirements 3.1**

Property 4: Preservation - Offline mode unaffected

_For any_ request made while the browser is offline, the fix SHALL not alter the offline loading behavior — cached surveys load from IndexedDB and missing caches show the offline-specific error message.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

**File**: `frontend/src/surveyor/pages/SurveyForm.jsx`

**Change 1: Survey loading error extraction (line ~718)**

Replace:
```javascript
setLoadingError(err.response?.data?.message || 'Gagal memuat survei.');
```

With:
```javascript
setLoadingError(err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.');
```

This adds `err.response?.data?.error` as the first choice in the fallback chain, matching the pattern already used by `SurveyList.jsx` and other components. The `message` fallback is retained for backward compatibility in case any future backend response uses that key.

**Change 2: Photo upload error extraction (line ~826)**

Replace:
```javascript
setSubmitError(err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.');
```

With:
```javascript
setSubmitError(err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.');
```

Same pattern applied to the photo upload catch block.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the root cause by observing that `err.response?.data?.message` returns `undefined` when the backend sends `{ error: '...' }`.

**Test Plan**: Write tests that mock API error responses with the `error` key and assert the error message displayed by `SurveyForm`. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Quota Exceeded Test**: Mock a 403 response with `{ error: 'Anda tidak memiliki kuota untuk survei ini' }` — assert the quota message is displayed (will fail on unfixed code, showing generic fallback instead)
2. **Survey Ended Test**: Mock a 409 response with `{ error: 'Survei sudah berakhir' }` — assert the deadline message is displayed (will fail on unfixed code)
3. **Survey Not Found Test**: Mock a 404 response with `{ error: 'Survei tidak ditemukan' }` — assert the not-found message is displayed (will fail on unfixed code)
4. **Photo Upload Format Error Test**: Mock a 422 response with `{ error: 'Format file tidak didukung...' }` on photo upload — assert the format message is displayed (will fail on unfixed code)

**Expected Counterexamples**:
- All tests will show the generic fallback message instead of the specific backend error
- Root cause confirmed: `err.response.data.message` is `undefined` because the backend uses the `error` key

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed error extraction produces the expected behavior.

**Pseudocode:**
```
FOR ALL err WHERE isBugCondition(err) DO
  result := extractErrorMessage_fixed(err)
  ASSERT result = err.response.data.error
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed error extraction produces the same result as the original.

**Pseudocode:**
```
FOR ALL err WHERE NOT isBugCondition(err) DO
  ASSERT extractErrorMessage_original(err) = extractErrorMessage_fixed(err)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many error response shapes automatically (missing keys, null values, empty strings, nested objects)
- It catches edge cases like `err.response.data.error` being an empty string, `0`, or `false`
- It provides strong guarantees that the fallback chain behaves identically for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for responses without the `error` key, then write property-based tests capturing that behavior.

**Test Cases**:
1. **No error or message key**: Verify that `{ someOtherKey: 'value' }` still falls back to the generic message on both original and fixed code
2. **Only message key present**: Verify that `{ message: 'some message' }` extracts the message on both original and fixed code
3. **Both keys present**: Verify that `{ error: 'err', message: 'msg' }` extracts `error` on fixed code (new behavior, acceptable since `error` is the canonical key)
4. **Null/undefined response data**: Verify that missing `err.response` or `err.response.data` still falls back to the generic message

### Unit Tests

- Test the error extraction logic for each backend error scenario (403, 404, 409, 422)
- Test the fallback chain: `error` key → `message` key → generic string
- Test edge cases: null response, undefined data, empty error string
- Test photo upload error extraction with the same scenarios

### Property-Based Tests

- Generate random error response objects with varying key combinations (`error`, `message`, both, neither) and verify the extraction follows the correct priority chain
- Generate random successful response payloads and verify survey loading is unaffected
- Generate error responses with non-string values for `error` key (numbers, objects, arrays) and verify graceful fallback

### Integration Tests

- Test full survey loading flow with mocked API returning specific error codes and messages
- Test that the error message is rendered in the UI and visible to the surveyor
- Test the photo upload error flow with mocked upload API errors
