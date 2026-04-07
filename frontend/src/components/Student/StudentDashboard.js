// src/components/Student/StudentDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/config";
import { Video, FileText, Trophy, Calendar, BookOpen } from 'lucide-react';
import "./StudentDashboard.css";

const StudentDashboard = () => {
  const [student, setStudent] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjectTeachers, setSubjectTeachers] = useState({});
  const navigate = useNavigate();

  // Subjects available (matching teacher subjects)
  const subjectsList = ["Java", "C", "Python", "C++"];

  useEffect(() => {
    fetchStudentProfile();
    fetchTeachersBySubject();
  }, []);

  const fetchStudentProfile = async () => {
    try {
      const response = await api.get("/api/students/profile");
      setStudent(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching profile:", error);
      setLoading(false);
    }
  };

  const fetchTeachersBySubject = async () => {
    try {
      const response = await api.get("/api/students/teachers-by-subject");
      if (response.data.success) {
        setSubjectTeachers(response.data.teachers);
      }
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/student/login");
  };

  if (loading) {
    return <div className="loading-container">Loading...</div>;
  }

  // Dashboard 1 - Subject Selection
  if (!selectedSubject) {
    return (
      <div className="student-dashboard">
        <header className="dashboard-header">
          <h1>Welcome, {student?.firstName} {student?.lastName}!</h1>
          <div className="header-info">
            <span className="class-badge">Coding</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <h2 className="section-title">Select Your Subject</h2>
        <div className="subjects-grid">
          {subjectsList.map((subject, index) => {
            const teacher = subjectTeachers[subject];
            return (
              <div 
                key={index} 
                className="subject-card" 
                onClick={() => setSelectedSubject(subject)}
              >
                <div className="subject-icon">
                  {subject === "Java" }
                  {subject === "C" }
                  {subject === "Python" }
                  {subject === "C++" }
                </div>
                <h3>{subject}</h3>
                <p className="teacher-name">
                  {teacher ? `Teacher: ${teacher.firstName} ${teacher.lastName}` : "Teacher assigned soon"}
                </p>
                <button className="select-subject-btn">Click to Enter</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Dashboard 2 - Subject Dashboard (shows ONLY content for selected subject)
  const currentTeacher = subjectTeachers[selectedSubject];
  const teacherId = currentTeacher?.id;

  return (
    <div className="student-dashboard subject-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => setSelectedSubject(null)}>
            ← Back to Subjects
          </button>
          <h1>{selectedSubject}</h1>
        </div>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </header>

      {/* Teacher Info for this subject */}
      {currentTeacher && (
        <div className="teacher-info-card">
          <div className="teacher-avatar">
            {currentTeacher.firstName?.charAt(0)}
            {currentTeacher.lastName?.charAt(0)}
          </div>
          <div className="teacher-details">
            <h3>{currentTeacher.firstName} {currentTeacher.lastName}</h3>
            <p>{selectedSubject} Teacher</p>
            <span className="teacher-email">{currentTeacher.email}</span>
          </div>
        </div>
      )}

      <h2 className="section-title">Quick Actions for {selectedSubject}</h2>
      <div className="actions-grid">
        <div 
          className="action-card" 
          onClick={() => navigate("/meeting-links", { state: { subject: selectedSubject, teacherId: teacherId } })}
        >
          <Video size={42} />
          <p>Meeting Links</p>
          <small>Join live classes</small>
        </div>
        
        <div 
          className="action-card" 
          onClick={() => navigate("/student/quizzes", { state: { subject: selectedSubject, teacherId: teacherId } })}
        >
          <FileText size={42} />
          <p>Quizzes</p>
          <small>Take subject tests</small>
        </div>
        
        <div 
          className="action-card" 
          onClick={() => navigate("/student/leaderboard", { state: { subject: selectedSubject, teacherId: teacherId } })}
        >
          <Trophy size={42} />
          <p>Leaderboard</p>
          <small>Check rankings</small>
        </div>
        
        <div 
          className="action-card" 
          onClick={() => navigate("/student/attendance", { state: { subject: selectedSubject, teacherId: teacherId } })}
        >
          <Calendar size={42} />
          <p>Attendance</p>
          <small>Track your presence</small>
        </div>
        
        <div 
          className="action-card" 
          onClick={() => navigate("/student/lms", { state: { subject: selectedSubject, teacherId: teacherId } })}
        >
          <BookOpen size={42} />
          <p>Learning Materials</p>
          <small>Notes & resources</small>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;