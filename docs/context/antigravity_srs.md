# 📗 Software Requirements Specification (SRS)

## Functional Requirements

### Quiz System
- Create, edit, delete questions
- Join via quiz code

### Code Execution
- Python and C support
- Compile and run securely

### Attempt Limiter
- Max attempts: 4

### Fullscreen Enforcement
- Must enter fullscreen to start
- Exit fullscreen pauses quiz

### Tab Switch Detection
- Detect tab change
- Increment violation count
- Require resume action

### Freeze System
- Teacher freezes quiz
- Editor becomes read-only
- Auto-submit code

### Leaderboard
- Hidden during quiz
- Revealed at end

## Non-Functional Requirements

### Performance
- <2 sec execution response

### Security
- Sandbox execution (Docker)

### Scalability
- Queue system (Redis)

### Reliability
- Auto-save user code

