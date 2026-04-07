// src/components/Student/TakeQuiz.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/config';
import './TakeQuiz.css';

const TakeQuiz = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  // Check if already submitted
  useEffect(() => {
    let isMounted = true;
    const checkSubmission = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/student/login');
          return;
        }
        console.log('Checking submission for quiz:', quizId);
        const res = await api.get(`/api/quizzes/check-submission/${quizId}`);
        console.log('Check submission response:', res.data);
        
        if (isMounted) {
          if (res.data.submitted) {
            alert('You have already taken this quiz.');
            navigate('/student/quizzes');
          } else {
            setChecking(false);
          }
        }
      } catch (err) {
        console.error('Check submission error:', err);
        setError('Failed to verify quiz access. Please try again.');
        if (isMounted) setChecking(false);
      }
    };
    checkSubmission();
    return () => { isMounted = false; };
  }, [quizId, navigate]);

  // Fetch quiz data
  useEffect(() => {
    if (checking) return;
    
    const fetchQuiz = async () => {
      try {
        console.log('Fetching quiz data for ID:', quizId);
        const res = await api.get(`/api/quizzes/${quizId}`);
        console.log('Quiz data response:', res.data);
        
        const quizData = res.data.quiz || res.data;
        setQuiz(quizData);

        const safeTimeLimit = quizData.timeLimit > 0 ? quizData.timeLimit : 60;
        setTimeLeft(safeTimeLimit * 60);
        
        // Initialize answers array
        setAnswers(new Array(quizData.questions.length).fill(''));
      } catch (err) {
        console.error('Fetch quiz error:', err);
        
        if (err.response?.status === 404) {
          alert('Quiz not found. It may have been deleted.');
        } else if (err.response?.status === 401) {
          alert('Your session has expired. Please login again.');
          navigate('/student/login');
        } else {
          alert('Could not load quiz: ' + (err.response?.data?.message || err.message));
        }
        
        navigate('/student/quizzes');
      }
    };
    
    fetchQuiz();
  }, [checking, quizId, navigate]);

  // Timer effect
  useEffect(() => {
    if (!quiz || submissionResult || timeLeft === null || timeLeft <= 0) return;
    
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (!submissionResult && !isSubmitting) {
            handleSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeLeft, quiz, submissionResult]);

  // Auto-submit when time reaches 0
  useEffect(() => {
    if (timeLeft === 0 && !submissionResult && !isSubmitting) {
      handleSubmit();
    }
  }, [timeLeft]);

  const handleAnswerChange = (questionIndex, value, optionLetter = null) => {
    const updated = [...answers];
    if (optionLetter !== null) {
      updated[questionIndex] = optionLetter;
    } else {
      updated[questionIndex] = value;
    }
    setAnswers(updated);
  };

  const handleSubmit = async () => {
    if (isSubmitting || submissionResult) return;
    
    // Confirm submission
    const confirmSubmit = window.confirm('Are you sure you want to submit your quiz?');
    if (!confirmSubmit) return;
    
    setIsSubmitting(true);
    
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    try {
      console.log('Submitting quiz...');
      console.log('Quiz ID:', quizId);
      console.log('Answers:', answers);
      
      const res = await api.post(`/api/quizzes/submit/${quizId}`, { 
        answers: answers,
        proctoringData: {} // Empty proctoring data for now
      });
      
      console.log('Submit response:', res.data);
      
      setSubmissionResult({
        score: res.data.score,
        percentage: res.data.percentage,
        correctAnswers: res.data.correctAnswers,
      });
      
      alert(`Quiz submitted successfully! Your score: ${res.data.score}/${res.data.totalQuestions}`);
      
    } catch (err) {
      console.error('Submit failed:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      
      if (err.response?.status === 400 && err.response?.data?.message?.includes('already submitted')) {
        alert('You have already submitted this quiz.');
        navigate('/student/quizzes');
      } else if (err.response?.status === 401) {
        alert('Session expired. Please login again.');
        navigate('/student/login');
      } else {
        alert('Could not submit quiz: ' + (err.response?.data?.message || 'Server error. Please try again.'));
        // Don't clear isSubmitting so they can try again
        setIsSubmitting(false);
        return;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="take-quiz-container loading">
        <div className="spinner"></div>
        <p>Verifying access...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="take-quiz-container loading">
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => navigate('/student/quizzes')} className="back-btn">
          Back to Quizzes
        </button>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="take-quiz-container loading">
        <p>Loading quiz...</p>
      </div>
    );
  }

  // Quiz taking view
  if (!submissionResult) {
    if (timeLeft === null) {
      return (
        <div className="take-quiz-container loading">
          <p>Preparing quiz...</p>
        </div>
      );
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
      <div className="take-quiz-container">
        <h2>{quiz.title}</h2>
        <div className="timer">
          ⏱️ Time left: {minutes}:{seconds.toString().padStart(2, '0')}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          {quiz.questions.map((q, i) => (
            <div key={i} className="question-block">
              <p><strong>Q{i + 1}:</strong> {q.question}</p>

              {q.type === 'mcq' ? (
                q.options.map((opt, j) => {
                  const optionLetter = String.fromCharCode(65 + j); // A, B, C, D
                  return (
                    <label key={j} className="option-label">
                      <input
                        type="radio"
                        name={`q-${i}`}
                        value={optionLetter}
                        checked={answers[i] === optionLetter}
                        onChange={() => handleAnswerChange(i, opt, optionLetter)}
                      />
                      <strong>{optionLetter}.</strong> {opt}
                    </label>
                  );
                })
              ) : (
                <input
                  type="text"
                  value={answers[i] || ''}
                  onChange={(e) => handleAnswerChange(i, e.target.value)}
                  placeholder="Type your answer"
                  className="blank-input"
                />
              )}
            </div>
          ))}

          <button type="submit" disabled={isSubmitting} className="submit-btn">
            {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        </form>
      </div>
    );
  }

  // Result view
  return (
    <div className="quiz-result-container">
      <h2>✅ Quiz Submitted!</h2>
      <div className="score-card">
        <h3>Your Score</h3>
        <div className="big-score">{submissionResult.score}</div>
        <p className="percentage">{submissionResult.percentage}%</p>
      </div>

      <button 
        onClick={() => setShowReview(!showReview)} 
        className="review-toggle-btn"
      >
        {showReview ? 'Hide Review' : 'Review Answers'}
      </button>

      {showReview && (
        <div className="review-section">
          <h4>Question Review</h4>
          {quiz.questions.map((q, i) => {
            let displayAnswer = answers[i] || '(not answered)';
            
            if (q.type === 'mcq' && answers[i]) {
              const optionIndex = answers[i].charCodeAt(0) - 65;
              if (q.options[optionIndex]) {
                displayAnswer = `${answers[i]}. ${q.options[optionIndex]}`;
              }
            }
            
            return (
              <div key={i} className="result-question">
                <p><strong>Q{i + 1}:</strong> {q.question}</p>
                <p>
                  Your answer:{' '}
                  <span className={answers[i] === submissionResult.correctAnswers[i] ? 'correct' : 'wrong'}>
                    {displayAnswer}
                  </span>
                </p>
                <p>
                  Correct answer:{' '}
                  <span className="correct">
                    {q.type === 'mcq' && submissionResult.correctAnswers[i] ? 
                      `${submissionResult.correctAnswers[i]}. ${q.options[submissionResult.correctAnswers[i].charCodeAt(0) - 65]}` 
                      : submissionResult.correctAnswers[i]}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => navigate('/student/quizzes')} className="back-btn">
        ← Back to Quizzes
      </button>
    </div>
  );
};

export default TakeQuiz;