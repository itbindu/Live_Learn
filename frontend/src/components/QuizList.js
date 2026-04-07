// src/components/Student/QuizList.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/config';
import './QuizList.css';

const QuizList = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { subject, teacherId, teacherName: passedTeacherName } = location.state || {};
  
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTeacher, setCurrentTeacher] = useState(null);

  useEffect(() => {
    console.log('QuizList mounted with state:', { subject, teacherId, passedTeacherName });
    
    if (teacherId) {
      console.log('Teacher ID found, fetching quizzes for teacher:', teacherId);
      fetchQuizzesByTeacher();
    } else {
      console.log('No teacher ID, fetching all quizzes');
      fetchAllQuizzes();
    }
  }, [teacherId, subject]);

  const fetchQuizzesByTeacher = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Validate teacherId
      if (!teacherId) {
        setError('No teacher selected. Please go back and select a subject.');
        setLoading(false);
        return;
      }
      
      console.log(`Making API call to: /api/quizzes/teacher/${teacherId}`);
      
      // Make sure teacherId is a string and properly formatted
      const endpoint = `/api/quizzes/teacher/${teacherId}`;
      console.log('Full endpoint:', endpoint);
      
      const response = await api.get(endpoint);
      
      console.log('API Response:', response.data);
      
      if (response.data.success) {
        setQuizzes(response.data.quizzes || []);
        setCurrentTeacher({
          id: response.data.teacherId,
          name: response.data.teacherName,
          subject: response.data.subject
        });
        console.log(`Found ${response.data.quizzes?.length || 0} quizzes`);
      } else {
        setError(response.data.message || 'Failed to load quizzes');
      }
    } catch (err) {
      console.error('Error fetching quizzes by teacher:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        config: err.config
      });
      
      if (err.response?.status === 404) {
        setError('Quiz endpoint not found. Please check if the server is running correctly.');
      } else if (err.response?.status === 403) {
        setError('You are not authorized to view these quizzes.');
      } else if (err.response?.status === 401) {
        setError('Please login again to continue.');
        setTimeout(() => navigate('/student/login'), 2000);
      } else {
        setError(err.response?.data?.message || 'Failed to load quizzes. Please try again.');
      }
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllQuizzes = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('Fetching all quizzes from: /api/quizzes/list');
      
      const response = await api.get('/api/quizzes/list');
      
      console.log('All quizzes response:', response.data);
      
      if (response.data.success) {
        setQuizzes(response.data.quizzes || []);
        console.log(`Found ${response.data.quizzes?.length || 0} total quizzes`);
      } else {
        setError(response.data.message || 'Failed to load quizzes');
      }
    } catch (err) {
      console.error('Error fetching all quizzes:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      
      if (err.response?.status === 404) {
        setError('Quiz endpoint not found. Please check server configuration.');
      } else if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
        setTimeout(() => navigate('/student/login'), 2000);
      } else {
        setError(err.response?.data?.message || 'Failed to load quizzes. Please try again.');
      }
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeQuiz = (quizId) => {
    navigate(`/proctored-quiz/${quizId}`);
  };

  const handleViewResult = (quizId) => {
    navigate(`/quiz-result/${quizId}`);
  };

  const handleRetry = () => {
    if (teacherId) {
      fetchQuizzesByTeacher();
    } else {
      fetchAllQuizzes();
    }
  };

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) {
    return (
      <div className="quiz-list-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading quizzes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-list-container">
      {/* Header with Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => navigate('/student/dashboard')}
          style={{
            background: '#1e293b',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          ← Back to Dashboard
        </button>
        <h2 style={{ margin: 0 }}>
          {currentTeacher 
            ? `${currentTeacher.subject} Quizzes - ${currentTeacher.name}`
            : subject 
              ? `${subject} Quizzes`
              : 'All Quizzes'}
        </h2>
      </div>

      {/* Debug info (remove in production) */}
      {process.env.NODE_ENV !== 'production' && (
        <div style={{ 
          background: '#f1f5f9', 
          padding: '10px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <strong>Debug Info:</strong><br />
          Subject: {subject || 'None'}<br />
          Teacher ID: {teacherId || 'None'}<br />
          API Base URL: {api.defaults.baseURL}<br />
          Quizzes Found: {quizzes.length}
        </div>
      )}

      {/* Teacher Info Card */}
      {currentTeacher && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '30px'
        }}>
          <h3 style={{ margin: '0 0 5px 0' }}>{currentTeacher.name}</h3>
          <p style={{ margin: 0, opacity: 0.9 }}>{currentTeacher.subject} Teacher</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <p><strong>Error:</strong> {error}</p>
          <button onClick={handleRetry} className="retry-btn">Retry</button>
        </div>
      )}

      {!error && quizzes.length === 0 && (
        <div className="no-quizzes">
          <div className="empty-state-icon">📝</div>
          <h3>No Quizzes Available</h3>
          <p>No quizzes have been created for this subject yet.</p>
          <p className="small-text">Check back later for new quizzes!</p>
          {teacherId && (
            <button 
              onClick={handleRetry} 
              style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
              className="retry-btn"
            >
              Refresh
            </button>
          )}
        </div>
      )}

      {!error && quizzes.length > 0 && (
        <div className="quizzes-grid">
          {quizzes.map((quiz) => (
            <div key={quiz._id} className={`quiz-card ${quiz.submitted ? 'submitted' : ''}`}>
              <h3>{quiz.title}</h3>
              
              <div className="quiz-meta">
                <span className="time-badge">⏱️ {quiz.timeLimit} min</span>
                <span className="questions-badge">📋 {quiz.questions?.length || 0} questions</span>
                <span className="proctored-badge">🎥 Proctored</span>
              </div>
              
              <div className="created-date">
                Created: {formatDate(quiz.createdAt)}
              </div>
              
              {!currentTeacher && quiz.teacherName && (
                <div className="teacher-info" style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>
                  👨‍🏫 {quiz.teacherName} ({quiz.subject})
                </div>
              )}
              
              {quiz.submitted ? (
                <div className="completed-container">
                  <span className="completed-label">✅ Completed</span>
                  <button 
                    onClick={() => handleViewResult(quiz._id)}
                    className="view-result-btn"
                  >
                    View Result
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => handleTakeQuiz(quiz._id)}
                  className="take-quiz-btn"
                >
                  Take Quiz
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizList;