# Bugfix Requirements Document

## Introduction

When a surveyor encounters an error while loading or starting a survey (e.g., quota exceeded, survey inactive, survey ended), the frontend always displays the generic fallback message "Gagal memuat survei." instead of the specific error message returned by the backend. This happens because the frontend reads `err.response?.data?.message` but the backend consistently sends error messages under the `error` key (e.g., `{ error: 'Kuota pengisian survei Anda sudah tercapai' }`). As a result, the extracted value is always `undefined` and the generic fallback is used, making it impossible for surveyors to understand the actual reason for the failure.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the backend returns an error response with the JSON key `error` (e.g., `{ error: 'Kuota pengisian survei Anda sudah tercapai' }`) THEN the system displays the generic message "Gagal memuat survei." because the frontend reads `err.response?.data?.message` which resolves to `undefined`

1.2 WHEN the backend returns a 403 error for quota exceeded (`{ error: 'Anda tidak memiliki kuota untuk survei ini' }`) THEN the system displays "Gagal memuat survei." instead of the quota-specific error message

1.3 WHEN the backend returns a 409 error for an inactive, ended, or not-yet-started survey (e.g., `{ error: 'Survei sudah berakhir' }`) THEN the system displays "Gagal memuat survei." instead of the survey-status-specific error message

1.4 WHEN the backend returns a 404 error for a survey not found (`{ error: 'Survei tidak ditemukan' }`) THEN the system displays "Gagal memuat survei." instead of the not-found error message

1.5 WHEN the backend returns a 422 validation error (`{ error: 'survey_id wajib diisi' }`) THEN the system displays "Gagal memuat survei." instead of the validation error message

### Expected Behavior (Correct)

2.1 WHEN the backend returns an error response with the JSON key `error` THEN the system SHALL display the actual error message from `err.response?.data?.error` to the surveyor

2.2 WHEN the backend returns a 403 error for quota exceeded (`{ error: 'Anda tidak memiliki kuota untuk survei ini' }`) THEN the system SHALL display "Anda tidak memiliki kuota untuk survei ini" to the surveyor

2.3 WHEN the backend returns a 409 error for an inactive, ended, or not-yet-started survey THEN the system SHALL display the specific status message (e.g., "Survei sudah berakhir", "Survei belum dimulai", "Survei tidak lagi aktif") to the surveyor

2.4 WHEN the backend returns a 404 error for a survey not found THEN the system SHALL display "Survei tidak ditemukan" to the surveyor

2.5 WHEN the backend returns a 422 validation error THEN the system SHALL display the specific validation message (e.g., "survey_id wajib diisi") to the surveyor

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the backend returns a successful response (2xx) with survey data THEN the system SHALL CONTINUE TO load and display the survey form correctly

3.2 WHEN the backend error response contains neither an `error` nor a `message` key THEN the system SHALL CONTINUE TO display the generic fallback "Gagal memuat survei."

3.3 WHEN the surveyor is offline and cached survey data is available THEN the system SHALL CONTINUE TO load the survey from the IndexedDB cache without attempting API calls

3.4 WHEN the surveyor is offline and no cached survey data is available THEN the system SHALL CONTINUE TO display the offline-specific error message "Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu."
