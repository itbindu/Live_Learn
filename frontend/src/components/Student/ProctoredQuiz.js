// src/components/Student/ProctoredQuiz.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/config';
import './ProctoredQuiz.css';

const ProctoredQuiz = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  
  // Sample quiz data
  const sampleQuiz = {
    _id: 'sample123',
    title: 'Mathematics Proctored Quiz',
    timeLimit: 10,
    questions: [
      {
        type: 'mcq',
        question: 'What is 2 + 2?',
        options: ['1', '2', '3', '4']
      },
      {
        type: 'mcq',
        question: 'What is 5 × 6?',
        options: ['30', '25', '35', '40']
      },
      {
        type: 'mcq',
        question: 'What is the square root of 16?',
        options: ['2', '3', '4', '5']
      },
      {
        type: 'mcq',
        question: 'What is 10 - 7?',
        options: ['2', '3', '4', '5']
      },
      {
        type: 'mcq',
        question: 'What is 9 ÷ 3?',
        options: ['2', '3', '4', '5']
      }
    ]
  };
  
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startError, setStartError] = useState('');
  const [showWarningPopup, setShowWarningPopup] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [autoSubmitTriggered, setAutoSubmitTriggered] = useState(false);
  
  const timerRef = useRef(null);
  const popupTimeoutRef = useRef(null);
  const isComponentMountedRef = useRef(true);
  const hasAutoSubmittedRef = useRef(false);
  const warningCountRef = useRef(0); // NEW: Use ref to track warning count synchronously

  useEffect(() => {
    isComponentMountedRef.current = true;
    // Load sample quiz
    setQuiz(sampleQuiz);
    setTimeLeft(sampleQuiz.timeLimit * 60);
    setAnswers(new Array(sampleQuiz.questions.length).fill(''));
    setLoading(false);
    
    return () => {
      isComponentMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      // Cleanup proctoring listeners
      if (window.proctoringCleanup) window.proctoringCleanup();
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (!quizStarted || submissionResult || timeLeft <= 0) return;
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (!isSubmitting && !submissionResult && !hasAutoSubmittedRef.current) {
            handleAutoSubmit("Time's up!");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [quizStarted, submissionResult]);

  // Setup proctoring IMMEDIATELY when quiz starts
  useEffect(() => {
    if (quizStarted && !submissionResult) {
      console.log("✅ QUIZ STARTED - Setting up proctoring NOW");
      setupProctoring();
    }
  }, [quizStarted, submissionResult]);

  const setupProctoring = () => {
    console.log("🔒 Setting up proctoring event listeners...");
    
    // 1. BLOCK Right Click
    const handleContextMenu = (e) => {
      e.preventDefault();
      addWarning("Right-click is not allowed!");
      return false;
    };
    document.addEventListener('contextmenu', handleContextMenu);
    
    // 2. BLOCK Copy
    const handleCopy = (e) => {
      e.preventDefault();
      addWarning("Copy (Ctrl+C) is not allowed!");
      return false;
    };
    document.addEventListener('copy', handleCopy);
    
    // 3. BLOCK Paste
    const handlePaste = (e) => {
      e.preventDefault();
      addWarning("Paste (Ctrl+V) is not allowed!");
      return false;
    };
    document.addEventListener('paste', handlePaste);
    
    // 4. BLOCK Cut
    const handleCut = (e) => {
      e.preventDefault();
      addWarning("Cut (Ctrl+X) is not allowed!");
      return false;
    };
    document.addEventListener('cut', handleCut);
    
    // 5. DETECT Keyboard Shortcuts
    const handleKeyDown = (e) => {
      // Block Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+P, Ctrl+S
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(key)) {
          e.preventDefault();
          let action = '';
          switch(key) {
            case 'c': action = 'Copy'; break;
            case 'v': action = 'Paste'; break;
            case 'x': action = 'Cut'; break;
            case 'a': action = 'Select All'; break;
            case 'p': action = 'Print'; break;
            case 's': action = 'Save'; break;
            case 'u': action = 'View Source'; break;
            default: action = 'Shortcut';
          }
          addWarning(`${action} (Ctrl+${key.toUpperCase()}) is not allowed!`);
        }
      }
      
      // Block F12 (DevTools)
      if (e.key === 'F12') {
        e.preventDefault();
        addWarning("Developer tools (F12) is not allowed!");
      }
      
      // Block Print Screen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        addWarning("Screenshot attempt is not allowed!");
      }
      
      // Detect Alt+Tab
      if (e.altKey && e.key === 'Tab') {
        addWarning("Window switching (Alt+Tab) detected!");
      }
      
      // Block Alt+F4
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        addWarning("Alt+F4 is blocked during quiz!");
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 6. DETECT Tab switching / Window blur
    const handleVisibilityChange = () => {
      if (document.hidden && quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        addWarning("Tab switching detected!");
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 7. DETECT Window blur (losing focus)
    let blurTimeout = null;
    const handleBlur = () => {
      if (quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        // Add small delay to prevent multiple rapid warnings
        if (blurTimeout) clearTimeout(blurTimeout);
        blurTimeout = setTimeout(() => {
          addWarning("Quiz window lost focus!");
        }, 100);
      }
    };
    window.addEventListener('blur', handleBlur);
    
    // 8. Block page refresh and close
    const handleBeforeUnload = (e) => {
      if (quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        e.preventDefault();
        e.returnValue = "Quiz is in progress! Leaving will count as a violation.";
        addWarning("Attempted to leave the quiz page!");
        return "Quiz is in progress! Leaving will count as a violation.";
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Store all listeners for cleanup
    const cleanup = () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (blurTimeout) clearTimeout(blurTimeout);
    };
    
    // Store cleanup function
    window.proctoringCleanup = cleanup;
    
    console.log("✅ All proctoring listeners active!");
  };

  // COMPLETELY FIXED: addWarning function with proper counting and auto-submit
  const addWarning = (message) => {
    // Prevent warnings after quiz is submitted or auto-submit triggered
    if (submissionResult || hasAutoSubmittedRef.current) {
      console.log("⚠️ Warning blocked - Quiz already submitted");
      return;
    }
    
    // Increment warning count using ref for synchronous tracking
    warningCountRef.current += 1;
    const newWarningCount = warningCountRef.current;
    
    console.log(`⚠️ WARNING #${newWarningCount}: ${message}`);
    
    // Update warnings array with timestamp
    const newWarning = {
      message,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setWarnings(prevWarnings => {
      console.log("Adding warning to array, new length:", prevWarnings.length + 1);
      return [...prevWarnings, newWarning];
    });
    
    // Update warning count state for display
    setWarningCount(newWarningCount);
    
    // Show popup for each warning
    setWarningMessage(message);
    setShowWarningPopup(true);
    
    // Clear previous timeout
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    
    // Auto-hide popup after 3 seconds
    popupTimeoutRef.current = setTimeout(() => {
      if (isComponentMountedRef.current) {
        setShowWarningPopup(false);
      }
    }, 3000);
    
    // CRITICAL: Check for auto-submit using the synchronous ref value
    if (newWarningCount >= 3 && !isSubmitting && !submissionResult && !hasAutoSubmittedRef.current) {
      console.log("🚨 3 WARNINGS REACHED! Auto-submitting immediately...");
      
      // Clear popup timeout to prevent it from showing after submit
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        setShowWarningPopup(false);
      }
      
      // Call auto-submit immediately
      handleAutoSubmit("3 warnings reached!");
    }
  };

  // FIXED: handleAutoSubmit with proper submission logic
  const handleAutoSubmit = useCallback((reason) => {
    // Prevent multiple auto-submissions
    if (hasAutoSubmittedRef.current || submissionResult || isSubmitting) {
      console.log("Auto-submit already triggered or quiz already submitted");
      return;
    }
    
    console.log(`🔴 AUTO-SUBMITTING QUIZ! Reason: ${reason}`);
    hasAutoSubmittedRef.current = true;
    setAutoSubmitTriggered(true);
    
    // Clear timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Close warning popup if open
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
      setShowWarningPopup(false);
    }
    
    // Calculate score immediately using current answers
    let correct = 0;
    const currentAnswers = answers;
    const questions = quiz.questions;
    
    console.log("Calculating score...");
    questions.forEach((q, idx) => {
      const userAnswer = currentAnswers[idx];
      const correctAnswer = getCorrectAnswerForQuestion(q, idx);
      console.log(`Q${idx + 1}: User: ${userAnswer}, Correct: ${correctAnswer}`);
      if (userAnswer === correctAnswer) {
        correct++;
      }
    });
    
    const percentage = (correct / questions.length) * 100;
    console.log(`Final score: ${correct}/${questions.length} (${percentage}%)`);
    
    // Set submission result
    setSubmissionResult({
      score: correct,
      percentage: Math.round(percentage),
      correctAnswers: correct,
      totalQuestions: questions.length,
      autoSubmitted: true,
      reason: reason
    });
    
    // Cleanup proctoring listeners
    if (window.proctoringCleanup) {
      window.proctoringCleanup();
      window.proctoringCleanup = null;
    }
    
    setIsSubmitting(false);
  }, [answers, quiz]);

  const getCorrectAnswerForQuestion = (question, index) => {
    // For sample quiz, define correct answers
    if (index === 0) return 'D'; // 2+2=4
    if (index === 1) return 'A'; // 5×6=30
    if (index === 2) return 'C'; // √16=4
    if (index === 3) return 'B'; // 10-7=3
    if (index === 4) return 'B'; // 9÷3=3
    
    const optionLetters = ['A', 'B', 'C', 'D'];
    return optionLetters[question.options.indexOf('')];
  };

  const startQuiz = async () => {
    if (isStartingQuiz || quizStarted) return;
    
    setIsStartingQuiz(true);
    setStartError('');
    
    try {
      setQuizStarted(true);
      // Reset warning ref when starting quiz
      warningCountRef.current = 0;
      console.log("✅ Quiz started successfully! Warning counter reset.");
    } catch (err) {
      console.error("Error starting quiz:", err);
      setStartError("Failed to start quiz. Please try again.");
    } finally {
      setIsStartingQuiz(false);
    }
  };

  const handleAnswerChange = (value) => {
    if (submissionResult || hasAutoSubmittedRef.current) return;
    
    const updated = [...answers];
    updated[currentQuestion] = value;
    setAnswers(updated);
  };

  const handleSubmit = async () => {
    if (isSubmitting || submissionResult || hasAutoSubmittedRef.current) {
      console.log("Submit blocked - quiz already submitted");
      return;
    }
    
    const confirmSubmit = window.confirm("Are you sure you want to submit your quiz?");
    if (!confirmSubmit) return;
    
    setIsSubmitting(true);
    
    // Calculate score
    let correct = 0;
    const questions = quiz.questions;
    
    questions.forEach((q, idx) => {
      const userAnswer = answers[idx];
      const correctAnswer = getCorrectAnswerForQuestion(q, idx);
      if (userAnswer === correctAnswer) {
        correct++;
      }
    });
    
    const percentage = (correct / questions.length) * 100;
    
    setSubmissionResult({
      score: correct,
      percentage: Math.round(percentage),
      correctAnswers: correct,
      totalQuestions: questions.length,
      autoSubmitted: false
    });
    
    // Cleanup proctoring listeners
    if (window.proctoringCleanup) {
      window.proctoringCleanup();
      window.proctoringCleanup = null;
    }
    
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsSubmitting(false);
  };

  const handleNextQuestion = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="proctored-quiz-container loading">
        <div className="spinner"></div>
        <p>Loading quiz...</p>
      </div>
    );
  }

  if (!quizStarted) {
    return (
      <div className="proctored-quiz-container start-screen">
        <div className="start-screen-content">
          <h1>📝 {quiz?.title}</h1>
          
          <div className="proctoring-requirements">
            <h3>⚠️ Proctoring Requirements</h3>
            <div className="requirements-list">
              <div className="requirement-item">
                <span className="requirement-icon">🖥️</span>
                <div className="requirement-text">
                  <strong>No Copy/Paste</strong>
                  <p>Copy, paste, and right-click are disabled</p>
                </div>
              </div>
              <div className="requirement-item">
                <span className="requirement-icon">🚫</span>
                <div className="requirement-text">
                  <strong>No Tab Switching</strong>
                  <p>Switching tabs or windows is prohibited</p>
                </div>
              </div>
              <div className="requirement-item">
                <span className="requirement-icon">⚠️</span>
                <div className="requirement-text">
                  <strong>3 Warnings = Auto-Submit</strong>
                  <p>3 violations will automatically submit your quiz</p>
                </div>
              </div>
              <div className="requirement-item">
                <span className="requirement-icon">⏱️</span>
                <div className="requirement-text">
                  <strong>Time Limit</strong>
                  <p>Quiz will auto-submit when time runs out</p>
                </div>
              </div>
            </div>
          </div>

          {startError && (
            <div className="error-message">
              <strong>Error:</strong> {startError}
              <button onClick={startQuiz} style={{ marginLeft: '10px' }}>Retry</button>
            </div>
          )}

          <button onClick={startQuiz} className="start-quiz-btn" disabled={isStartingQuiz}>
            {isStartingQuiz ? 'Starting...' : 'Start Proctored Quiz'}
          </button>
        </div>
      </div>
    );
  }

  if (!submissionResult) {
    const currentQ = quiz.questions[currentQuestion];
    const isLastQuestion = currentQuestion === quiz.questions.length - 1;
    
    return (
      <div className="proctored-quiz-container quiz-active">
        {/* Warning Popup */}
        {showWarningPopup && (
          <div className="warning-popup-overlay">
            <div className="warning-popup" onClick={(e) => e.stopPropagation()}>
              <div className="warning-popup-header">
                <span className="warning-icon">⚠️</span>
                <h3>Proctoring Alert</h3>
                <button className="close-popup" onClick={() => setShowWarningPopup(false)}>×</button>
              </div>
              <div className="warning-popup-content">
                <p>{warningMessage}</p>
                <p className="warning-count-text">Warning {warningCount}/3</p>
              </div>
              <div className="warning-popup-footer">
                <button onClick={() => setShowWarningPopup(false)}>I Understand</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="quiz-header">
          <div className="header-left">
            <div className="quiz-name">{quiz.title}</div>
            <div className="timer-box">{formatTime(timeLeft)}</div>
          </div>
          <div className="warning-counter" style={{ 
            backgroundColor: warningCount >= 2 ? '#ff4444' : '#333',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '5px',
            fontWeight: 'bold'
          }}>
            ⚠️ Warnings: {warningCount}/3
          </div>
          <button className="finish-top-btn" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Finish Quiz'}
          </button>
        </div>

        {/* Body */}
        <div className="quiz-body">
          <div className="question-panel">
            <div className="question-header">
              <span className="question-number">Question {currentQuestion + 1} of {quiz.questions.length}</span>
              <span className="total-marks">Marks: 1</span>
            </div>
            <div className="question-text">{currentQ.question}</div>
          </div>

          <div className="answer-panel">
            <h3>Your Answer</h3>
            {currentQ.options.map((opt, idx) => {
              const optionLetter = String.fromCharCode(65 + idx);
              return (
                <label key={idx} className="option-label">
                  <input
                    type="radio"
                    name="question"
                    checked={answers[currentQuestion] === optionLetter}
                    onChange={() => handleAnswerChange(optionLetter)}
                    disabled={!!submissionResult}
                  />
                  <span>
                    <strong>{optionLetter}.</strong> {opt}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="quiz-navigation">
          <button 
            onClick={handlePrevQuestion} 
            disabled={currentQuestion === 0 || submissionResult}
            className="nav-btn"
          >
            ← Previous
          </button>
          {!isLastQuestion ? (
            <button 
              onClick={handleNextQuestion} 
              className="nav-btn primary"
            >
              Next →
            </button>
          ) : (
            <button 
              onClick={handleSubmit} 
              className="nav-btn primary submit-btn"
              disabled={isSubmitting || submissionResult}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          )}
        </div>

        {/* Warnings Panel */}
        {warnings.length > 0 && (
          <div className="warnings-panel">
            <h4>⚠️ Recent Warnings ({warningCount}/3)</h4>
            {warnings.slice(-5).reverse().map((w, i) => (
              <div key={i} className="warning-item">
                {w.timestamp}: {w.message}
              </div>
            ))}
            {warningCount >= 3 && (
              <div className="auto-submit-warning" style={{
                backgroundColor: '#ff4444',
                color: 'white',
                padding: '10px',
                marginTop: '10px',
                borderRadius: '5px',
                textAlign: 'center',
                fontWeight: 'bold'
              }}>
                🚨 3 warnings reached! Quiz is being submitted automatically...
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Result Screen
  return (
    <div className="proctored-quiz-container result-screen">
      <div className="result-content">
        <h1>{submissionResult.autoSubmitted ? '⚠️ Quiz Auto-Submitted!' : '✅ Quiz Submitted!'}</h1>
        {submissionResult.autoSubmitted && (
          <div className="auto-submit-message">
            <p>⚠️ Quiz was automatically submitted due to: {submissionResult.reason}</p>
          </div>
        )}
        <div className="score-circle">
          <span className="score-number">{submissionResult.percentage}%</span>
        </div>
        <div className="score-details">
          <p>Score: {submissionResult.score} / {submissionResult.totalQuestions}</p>
          <p>Percentage: {submissionResult.percentage}%</p>
          <p>Correct Answers: {submissionResult.correctAnswers} out of {submissionResult.totalQuestions}</p>
        </div>
        <button onClick={() => navigate('/student/quizzes')} className="back-btn">
          ← Back to Quizzes
        </button>
      </div>
    </div>
  );
};

export default ProctoredQuiz;