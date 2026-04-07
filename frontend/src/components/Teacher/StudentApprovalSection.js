// src/components/Teacher/StudentApprovalSection.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/config";
import "./StudentApprovalSection.css";

const StudentApprovalSection = () => {
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentTeacher, setCurrentTeacher] = useState(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentTeacher();
    fetchRegisteredStudents();
  }, []);

  const fetchCurrentTeacher = async () => {
    try {
      const response = await api.get("/api/teachers/profile");
      setCurrentTeacher(response.data);
    } catch (error) {
      console.error("Error fetching teacher:", error);
    }
  };

  const fetchRegisteredStudents = async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/teachers/registered-students");
      if (response.data.success) {
        setStudents(response.data.students);
      } else {
        setStudents(response.data || []);
      }
    } catch (error) {
      console.error("Error fetching students:", error.response?.data || error.message);
      setMessage('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Only Class Teachers can approve students
  const handleApproveStudent = async (studentId) => {
    try {
      const response = await api.post("/api/teachers/approve-student", { studentId });
      setMessage(response.data.message || 'Student approved and auto-assigned to all subject teachers!');
      fetchRegisteredStudents();
      setTimeout(() => setMessage(""), 5000);
    } catch (error) {
      console.error("Error approving student:", error.response?.data || error.message);
      setMessage(error.response?.data?.message || 'Failed to approve student');
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const goToDashboard = () => {
    navigate("/teacher/dashboard");
  };

  const currentTeacherId = localStorage.getItem("teacherId");
  const isClassTeacher = currentTeacher?.role === 'class';

  if (loading) {
    return (
      <div className="students-section">
        <h2>Student Management</h2>
        <p className="loading">Loading students...</p>
      </div>
    );
  }

  return (
    <div className="students-section">
      <div className="section-header">
        <h2>Student Management</h2>
        {!isClassTeacher && (
          <div className="warning-banner">
            ⚠️ You are a Subject Teacher. Only Class Teachers can approve students.
            <br />
            <small>Students are automatically assigned to you when the Class Teacher approves them.</small>
          </div>
        )}
        {isClassTeacher && (
          <div className="info-banner">
            📌 When you approve a student, they will be <strong>automatically assigned to ALL subject teachers</strong> (Java, C, Python, C++).
            <br />
            <small>No manual assignment needed for subject teachers!</small>
          </div>
        )}
      </div>
      
      {message && (
        <div className={`status-message ${message.includes("Failed") ? "error" : "success"}`}>
          {message}
        </div>
      )}

      {students.length === 0 ? (
        <p className="empty-list">No students registered yet.</p>
      ) : (
        <>
          <div className="students-header">
            <span>Student</span>
            <span>Email</span>
            <span>Class</span>
            <span>Status</span>
            <span>Teachers Count</span>
            <span>Actions</span>
          </div>
          
          <ul className="students-list">
            {students.map((student) => {
              const isApproved = student.isApproved;
              
              return (
                <li key={student._id} className="student-row">
                  <div className="student-info">
                    <strong>{student.firstName} {student.lastName}</strong>
                  </div>
                  
                  <div className="student-email">
                    {student.email}
                  </div>
                  
                  <div className="student-class">
                    Class {student.class || '10'}
                  </div>
                  
                  <div className="student-status">
                    {isApproved ? (
                      <span className="status-approved">✅ Approved</span>
                    ) : (
                      <span className="status-pending">⏳ Pending Approval</span>
                    )}
                  </div>
                  
                  <div className="teachers-count">
                    {student.teachers?.length || 0} teacher(s)
                  </div>
                  
                  <div className="student-actions">
                    {isClassTeacher && !isApproved && (
                      <button 
                        onClick={() => handleApproveStudent(student._id)}
                        className="assign-button"
                      >
                        Approve & Auto-Assign
                      </button>
                    )}
                    {isApproved && (
                      <span className="already-assigned">✓ Auto-assigned to all subject teachers</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="section-footer">
        <button onClick={goToDashboard} className="dashboard-btn">
          Go to Dashboard
        </button>
      </div>
    </div>
  );
};

export default StudentApprovalSection;