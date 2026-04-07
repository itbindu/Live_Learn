// src/components/Student/ProctoredQuiz.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/config';
import './ProctoredQuiz.css';

const ProctoredQuiz = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  
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
  const warningCountRef = useRef(0);

  // ✅ FIX: Fetch actual quiz data from API
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        setLoading(true);
        console.log('Fetching quiz data for ID:', quizId);
        
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/student/login');
          return;
        }
        
        const response = await api.get(`/api/quizzes/${quizId}`);
        console.log('Quiz data response:', response.data);
        
        const quizData = response.data.quiz || response.data;
        
        if (!quizData || !quizData.questions) {
          throw new Error('Invalid quiz data received');
        }
        
        setQuiz(quizData);
        setTimeLeft(quizData.timeLimit * 60);
        setAnswers(new Array(quizData.questions.length).fill(''));
        setLoading(false);
        
      } catch (err) {
        console.error('Error fetching quiz:', err);
        setError(err.response?.data?.message || 'Failed to load quiz');
        setLoading(false);
      }
    };
    
    fetchQuiz();
    
    return () => {
      isComponentMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      if (window.proctoringCleanup) window.proctoringCleanup();
    };
  }, [quizId, navigate]);

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
    if (quizStarted && !submissionResult && quiz) {
      console.log("✅ QUIZ STARTED - Setting up proctoring NOW");
      setupProctoring();
    }
  }, [quizStarted, submissionResult, quiz]);

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
      
      if (e.key === 'F12') {
        e.preventDefault();
        addWarning("Developer tools (F12) is not allowed!");
      }
      
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        addWarning("Screenshot attempt is not allowed!");
      }
      
      if (e.altKey && e.key === 'Tab') {
        addWarning("Window switching (Alt+Tab) detected!");
      }
      
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        addWarning("Alt+F4 is blocked during quiz!");
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 6. DETECT Tab switching
    const handleVisibilityChange = () => {
      if (document.hidden && quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        addWarning("Tab switching detected!");
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 7. DETECT Window blur
    let blurTimeout = null;
    const handleBlur = () => {
      if (quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        if (blurTimeout) clearTimeout(blurTimeout);
        blurTimeout = setTimeout(() => {
          addWarning("Quiz window lost focus!");
        }, 100);
      }
    };
    window.addEventListener('blur', handleBlur);
    
    // 8. Block page refresh
    const handleBeforeUnload = (e) => {
      if (quizStarted && !submissionResult && !hasAutoSubmittedRef.current) {
        e.preventDefault();
        e.returnValue = "Quiz is in progress! Leaving will count as a violation.";
        addWarning("Attempted to leave the quiz page!");
        return "Quiz is in progress! Leaving will count as a violation.";
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Store cleanup
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
    
    window.proctoringCleanup = cleanup;
    console.log("✅ All proctoring listeners active!");
  };

  const addWarning = (message) => {
    if (submissionResult || hasAutoSubmittedRef.current) {
      console.log("⚠️ Warning blocked - Quiz already submitted");
      return;
    }
    
    warningCountRef.current += 1;
    const newWarningCount = warningCountRef.current;
    
    console.log(`⚠️ WARNING #${newWarningCount}: ${message}`);
    
    const newWarning = {
      message,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setWarnings(prevWarnings => [...prevWarnings, newWarning]);
    setWarningCount(newWarningCount);
    
    setWarningMessage(message);
    setShowWarningPopup(true);
    
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    
    popupTimeoutRef.current = setTimeout(() => {
      if (isComponentMountedRef.current) {
        setShowWarningPopup(false);
      }
    }, 3000);
    
    if (newWarningCount >= 3 && !isSubmitting && !submissionResult && !hasAutoSubmittedRef.current) {
      console.log("🚨 3 WARNINGS REACHED! Auto-submitting immediately...");
      
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        setShowWarningPopup(false);
      }
      
      handleAutoSubmit("3 warnings reached!");
    }
  };

  // ✅ FIX: Calculate correct answers based on actual quiz data
  const getCorrectAnswerForQuestion = (question, index) => {
    // For MCQ questions, the correctAnswer should be stored in the database
    // Make sure your quiz creation saves the correctAnswer field
    if (quiz && quiz.questions && quiz.questions[index]) {
      return quiz.questions[index].correctAnswer;
    }
    return '';
  };

  const handleAutoSubmit = useCallback((reason) => {
    if (hasAutoSubmittedRef.current || submissionResult || isSubmitting) {
      console.log("Auto-submit already triggered or quiz already submitted");
      return;
    }
    
    console.log(`🔴 AUTO-SUBMITTING QUIZ! Reason: ${reason}`);
    hasAutoSubmittedRef.current = true;
    setAutoSubmitTriggered(true);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
      setShowWarningPopup(false);
    }
    
    let correct = 0;
    const currentAnswers = answers;
    const questions = quiz.questions;
    
    console.log("Calculating score...");
    questions.forEach((q, idx) => {
      const userAnswer = currentAnswers[idx];
      const correctAnswer = getCorrectAnswerForQuestion(q, idx);
      console.log(`Q${idx + 1}: User: ${userAnswer}, Correct: ${correctAnswer}`);
      if (userAnswer && userAnswer === correctAnswer) {
        correct++;
      }
    });
    
    const percentage = (correct / questions.length) * 100;
    console.log(`Final score: ${correct}/${questions.length} (${percentage}%)`);
    
    setSubmissionResult({
      score: correct,
      percentage: Math.round(percentage),
      correctAnswers: correct,
      totalQuestions: questions.length,
      autoSubmitted: true,
      reason: reason
    });
    
    if (window.proctoringCleanup) {
      window.proctoringCleanup();
      window.proctoringCleanup = null;
    }
    
    setIsSubmitting(false);
  }, [answers, quiz, submissionResult, isSubmitting]);

  const startQuiz = async () => {
    if (isStartingQuiz || quizStarted) return;
    
    setIsStartingQuiz(true);
    setStartError('');
    
    try {
      // Optional: Call API to mark quiz as started
      // await api.post(`/api/quizzes/${quizId}/start`);
      setQuizStarted(true);
      warningCountRef.current = 0;
      console.log("✅ Quiz started successfully!");
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
      if (userAnswer && userAnswer === correctAnswer) {
        correct++;
      }
    });
    
    const percentage = (correct / questions.length) * 100;
    
    // ✅ Send submission to backend
    try {
      const response = await api.post(`/api/quizzes/submit/${quizId}`, {
        answers: answers,
        proctoringData: {
          warnings: warnings,
          autoSubmitted: false
        }
      });
      
      console.log('Submission saved:', response.data);
      
      setSubmissionResult({
        score: response.data.score || correct,
        percentage: response.data.percentage || Math.round(percentage),
        correctAnswers: correct,
        totalQuestions: questions.length,
        autoSubmitted: false
      });
    } catch (err) {
      console.error('Failed to save submission:', err);
      // Still show result even if API fails
      setSubmissionResult({
        score: correct,
        percentage: Math.round(percentage),
        correctAnswers: correct,
        totalQuestions: questions.length,
        autoSubmitted: false
      });
    }
    
    // Cleanup proctoring listeners
    if (window.proctoringCleanup) {
      window.proctoringCleanup();
      window.proctoringCleanup = null;
    }
    
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

  if (error) {
    return (
      <div className="proctored-quiz-container error-screen">
        <div className="error-content">
          <h2>Error Loading Quiz</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/student/quizzes')} className="back-btn">
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  if (!quizStarted) {
    return (
      <div className="proctored-quiz-container start-screen">
        <div className="start-screen-content">
          <h1>📝 {quiz.title}</h1>
          
          <div className="quiz-info">
            <div className="info-card">
              <span className="info-icon">⏱️</span>
              <span className="info-label">Time Limit</span>
              <span className="info-value">{quiz.timeLimit} minutes</span>
            </div>
            <div className="info-card">
              <span className="info-icon">📋</span>
              <span className="info-label">Questions</span>
              <span className="info-value">{quiz.questions.length}</span>
            </div>
            <div className="info-card">
              <span className="info-icon">🎥</span>
              <span className="info-label">Proctoring</span>
              <span className="info-value">Enabled</span>
            </div>
          </div>
          
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
            {currentQ.type === 'mcq' ? (
              currentQ.options.map((opt, idx) => {
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
              })
            ) : (
              <input
                type="text"
                className="blank-input"
                value={answers[currentQuestion] || ''}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your answer here..."
              />
            )}
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