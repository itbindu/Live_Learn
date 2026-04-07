// src/components/Teacher/TeacherDashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../../api/config";
import './TeacherDashboard.css';
import { 
  Calendar, 
  Video, 
  CalendarDays, 
  FileText, 
  Trophy, 
  BookOpen, 
  BarChart3,
  Users,
  ClipboardList
} from 'lucide-react';

const TeacherDashboard = () => {
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [showApprovalPage, setShowApprovalPage] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [teacherName, setTeacherName] = useState('Teacher');
  const [teacherId, setTeacherId] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('');
  const [teacherRole, setTeacherRole] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTeacherProfile();
    fetchRegisteredStudents();
    fetchAllStudents();
  }, []);

  const fetchTeacherProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const response = await api.get("/api/teachers/profile");
      const fullName = `${response.data.firstName || ''} ${response.data.lastName || ''}`.trim();
      setTeacherName(fullName || 'Teacher');
      
      // Store teacherId and subject for later use
      if (response.data._id) {
        localStorage.setItem('teacherId', response.data._id);
        setTeacherId(response.data._id);
      }
      
      // Get teacher's subject and role
      if (response.data.subject) {
        setTeacherSubject(response.data.subject);
      }
      if (response.data.role) {
        setTeacherRole(response.data.role);
      }
      
    } catch (error) {
      console.error("Error fetching teacher profile:", error.response?.data || error.message);
      const stored = JSON.parse(localStorage.getItem('teacherUser') || '{}');
      const fullName = `${stored.firstName || ''} ${stored.lastName || ''}`.trim();
      setTeacherName(fullName || 'Teacher');
      
      const storedTeacherId = localStorage.getItem('teacherId');
      if (storedTeacherId) {
        setTeacherId(storedTeacherId);
      }
      
      // Get subject from stored data
      if (stored.subject) {
        setTeacherSubject(stored.subject);
      }
      if (stored.role) {
        setTeacherRole(stored.role);
      }
    }
  };

  const fetchRegisteredStudents = async () => {
    try {
      const response = await api.get("/api/teachers/registered-students");
      if (response.data.success) {
        setRegisteredStudents(response.data.students);
      } else {
        setRegisteredStudents(response.data || []);
      }
    } catch (error) {
      console.error("Error fetching students:", error.response?.data || error.message);
      setMessage('Failed to load students');
    }
  };

  const fetchAllStudents = async () => {
    try {
      const response = await api.get("/api/teachers/all-students");
      if (response.data.success) {
        setStudents(response.data.students);
      } else {
        setStudents([]);
      }
    } catch (error) {
      console.error("Error fetching all students:", error.response?.data || error.message);
      setStudents([]);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem('teacherUser');
    localStorage.removeItem('teacherId');
    navigate("/teacher/login");
  };

  // Get subject icon based on subject name
  const getSubjectIcon = (subject) => {
    switch(subject) {
      case 'Java': return '#';
      case 'C': return '#';
      case 'Python': return '#';
      case 'C++': return '#';
      default: return '📚';
    }
  };

  // Get role badge color
  const getRoleBadgeClass = () => {
    return teacherRole === 'class' ? 'role-badge class-teacher' : 'role-badge subject-teacher';
  };

  return (
    <div className="teacher-dashboard">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="header-info">
          <h1>Welcome, {teacherName}!</h1>
          {teacherSubject && (
            <div className="subject-badge">
              <span className="subject-icon">{getSubjectIcon(teacherSubject)}</span>
              <span className="subject-name">{teacherSubject}</span>
            </div>
          )}
          {teacherRole && (
            <div className={getRoleBadgeClass()}>
              {teacherRole === 'class' ? ' Class Teacher' : ' Subject Teacher'}
            </div>
          )}
        </div>
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {/* QUICK ACTIONS */}
      <h2 className="section-title">
        Quick Actions 
        {teacherSubject && <span className="subject-title"> for {teacherSubject}</span>}
      </h2>

      <section className="quick-actions">
        <Link className="action-card" to="/teacher/create-meeting">
          <Video className="card-icon" size={42} />
          Create Meeting
          
        </Link>

        <Link className="action-card" to="/teacher/my-meetings">
          <CalendarDays className="card-icon" size={42} />
          My Meetings
          
        </Link>

        <Link className="action-card" to="/teacher/create-quiz">
          <FileText className="card-icon" size={42} />
          Create Quiz
          
        </Link>

        <Link className="action-card" to="/teacher/quiz-list">
          <ClipboardList className="card-icon" size={42} />
          My Quiz List
          
        </Link>

        <Link className="action-card" to="/teacher/leaderboard">
          <Trophy className="card-icon" size={42} />
          Leaderboard
          
        </Link>

        <Link className="action-card" to="/teacher/lms">
          <BookOpen className="card-icon" size={42} />
          Course Materials
          
        </Link>

        <Link className="action-card" to="/teacher/attendance">
          <BarChart3 className="card-icon" size={42} />
          Attendance Records
          
        </Link>

        <Link className="action-card" to="/teacher/student-approval">
          <Users className="card-icon" size={42} />
          Student Approval
          
        </Link>
      </section>
    </div>
  );
};

export default TeacherDashboard;