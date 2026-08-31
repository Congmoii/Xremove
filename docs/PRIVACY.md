# Privacy Architecture and Data Handling

Xremove is built with a strict **local-first privacy model**. This document outlines how data flows through the application, where data is held, and how resources are reclaimed.

---

## Data Flow Lifecycle

```
[User Input File]
      ↓
[In-Memory Inspection / Classification]
      ↓
[Local Processing] (Browser Canvas OR Local Service @ 127.0.0.1)
      ↓
[In-Memory Preview Result]
      ↓
[User Explicit Download Request]
      ↓
[Memory Reclamation / Object URL Revocation]
```

---

## Key Privacy Guarantees

1. **No External Network Communication**:
   - Image processing runs 100% inside your browser environment using HTML5 Canvas APIs.
   - Text, DOCX, and video workflows communicate exclusively with the local companion service bound to the loopback interface (`127.0.0.1:8765`).
   - No data packets leave the host machine.

2. **No User Document Persistence**:
   - Original and processed files are never saved to disk automatically.
   - Processed files are created as transient browser `Blob` objects in memory.
   - Files are saved to your filesystem only when you explicitly click "Download result".

3. **Memory and State Reclamation**:
   - When you click "Add another file", return to the home screen, or close the application window, all `Blob` URLs (`URL.revokeObjectURL`) and text buffers are immediately cleared.

4. **Local Storage Usage**:
   - `localStorage` is used solely for storing non-sensitive user UI preferences:
     - `xremove.lang`: User language selection (`"vi"` or `"en"`).
   - Document contents, filenames, history, and hashes are **never** stored in `localStorage` or `sessionStorage`.

5. **Telemetry and Analytics**:
   - Xremove contains zero telemetry, analytics, trackers, or remote logging services.
