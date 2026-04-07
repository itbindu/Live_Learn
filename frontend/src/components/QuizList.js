// src/components/QuizList.js
import React, { useState, useEffect } from 'react';
import api from '../api/config';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './QuizList.css';

const QuizList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const { teacherId, subject } = location.state || {};

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const token = localStorage.getItem('token');
        
        if (!token) {
          setError('No authentication token found. Please login again.');
          setLoading(false);
          return;
        }

        const response = await api.get('/api/quizzes/list');

        if (response.data.success) {
          let allQuizzes = response.data.quizzes || [];
          
          if (teacherId) {
            allQuizzes = allQuizzes.filter(quiz => quiz.teacherId === teacherId);
            console.log(`📝 ${subject} - Found ${allQuizzes.length} quizzes`);
          }
          
          setQuizzes(allQuizzes);
        } else {
          setError(response.data.message || 'Failed to load quizzes.');
        }
      } catch (err) {
        console.error('Fetch quizzes error:', err);
        
        if (err.response?.status === 401) {
          setError('Your session has expired. Please login again.');
          localStorage.removeItem('token');
          setTimeout(() => {
            window.location.href = '/student/login';
          }, 2000);
        } else if (err.response?.status === 403) {
          setError('Your account is not approved yet. Please wait for teacher approval.');
        } else if (err.response?.status === 404) {
          setError('No quizzes found for your teachers.');
          setQuizzes([]);
        } else {
          setError(err.response?.data?.message || 'Failed to load quizzes. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchQuizzes();
  }, [teacherId]);

  if (loading) {
    return (
      <div className="quiz-list-container">
        <div className="loading-spinner">Loading quizzes...</div>
      </div>
    );
  }

  return (
    <div className="quiz-list-container">
      <button
        onClick={() => navigate('/student/dashboard')}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: '#1e293b',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '18px'
        }}
      >
        ←
      </button>
      
      <h2>{subject ? `${subject} Quizzes` : 'Available Quizzes'}</h2>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="retry-btn">
            Try Again
          </button>
        </div>
      )}
      
      {!error && quizzes.length === 0 ? (
        <div className="no-quizzes">
          <div className="empty-state-icon">📝</div>
          <h3>No Quizzes Available</h3>
          <p>There are no quizzes available for {subject || 'you'} at the moment.</p>
          <p className="small-text">Once your teacher creates a quiz, it will appear here.</p>
        </div>
      ) : (
        <div className="quizzes-grid">
          {quizzes.map((quiz) => (
            <div key={quiz._id} className={`quiz-card ${quiz.submitted ? 'submitted' : ''}`}>
              <h3>{quiz.title}</h3>
              <div className="quiz-meta">
                <span className="time-badge">⏱️ {quiz.timeLimit} minutes</span>
                <span className="questions-badge">📋 {quiz.questions?.length || 0} questions</span>
                <span className="proctored-badge">🎥 Proctored</span>
              </div>
              <p className="created-date">
                Created: {new Date(quiz.createdAt).toLocaleDateString()}
              </p>
              {quiz.submitted ? (
                <div className="completed-container">
                  <span className="completed-label">✓ Completed</span>
                  <Link to={`/quiz-result/${quiz._id}`} className="view-result-btn">
                    View Result
                  </Link>
                </div>
              ) : (
                <Link to={`/proctored-quiz/${quiz._id}`} className="take-quiz-btn">
                  Start Proctored Quiz
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizList;