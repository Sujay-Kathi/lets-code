# 🗄️ Antigravity Database Design Document

## 📌 Overview
This document defines the database schema, relationships, and design decisions for the Antigravity Live Coding Quiz Platform.

---

## 🎯 Goals
- Store quiz and user data persistently
- Track submissions, attempts, and scores
- Support real-time leaderboard updates
- Enable anti-cheat tracking

---

## 🧱 Entity Relationship Overview

User ──< QuizParticipant >── Quiz ──< Question ──< Submission
                         │
                         └── Violation

---

## 📊 Tables

### 1. Users
Stores all users (students and teachers)

Fields:
- id (PK)
- name
- role (student/teacher)
- created_at

---

### 2. Quizzes
Stores quiz sessions

Fields:
- id (PK)
- title
- created_by (FK → users)
- status (draft/active/ended)
- start_time
- end_time

---

### 3. Quiz Participants
Tracks which users joined a quiz

Fields:
- id (PK)
- quiz_id (FK)
- user_id (FK)
- joined_at

Constraint:
- Unique (quiz_id, user_id)

---

### 4. Questions
Stores coding questions

Fields:
- id (PK)
- quiz_id (FK)
- title
- description
- language (python/c)
- max_score
- time_limit

---

### 5. Test Cases
Stores input/output test cases

Fields:
- id (PK)
- question_id (FK)
- input
- expected_output
- is_hidden

---

### 6. Submissions
Stores all code submissions

Fields:
- id (PK)
- user_id (FK)
- question_id (FK)
- code
- language
- status (pending/running/accepted/wrong_answer/error)
- score
- execution_time
- created_at

---

### 7. Attempts
Tracks attempts per student per question

Fields:
- id (PK)
- user_id (FK)
- question_id (FK)
- attempts_used

Constraint:
- Unique (user_id, question_id)

---

### 8. Violations
Tracks anti-cheat violations

Fields:
- id (PK)
- user_id (FK)
- quiz_id (FK)
- tab_switch_count
- last_violation

---

### 9. Scores
Stores total score per quiz per user

Fields:
- id (PK)
- user_id (FK)
- quiz_id (FK)
- total_score
- last_updated

Constraint:
- Unique (user_id, quiz_id)

---

## 🔄 Data Flow

1. User joins quiz → entry in quiz_participants
2. User submits code → new submission record
3. Attempt count updated
4. Code executed → result stored
5. Score updated in scores table

---

## ⚡ Indexing Strategy

- Index on submissions(user_id)
- Index on submissions(question_id)
- Index on scores(quiz_id)
- Index on questions(quiz_id)

---

## 🔒 Constraints & Rules

- Max attempts = 4 (enforced in backend)
- No submissions after freeze
- Tab switches tracked per user

---

## ⚠️ Design Considerations

- Separate attempts table for clarity
- Scores table for fast leaderboard
- Test cases separated for flexibility

---

## 🚀 Future Improvements

- Add plagiarism detection table
- Add audit logs
- Add session tracking

---

## ✅ Summary

This database design supports:
- Real-time quizzes
- Code execution tracking
- Anti-cheat monitoring
- Scalable leaderboard system

---

END OF DOCUMENT
