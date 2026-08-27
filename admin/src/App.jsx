import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('govassist_admin_token') || '');
  const [loginInput, setLoginInput] = useState({ username: 'admin', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [schemes, setSchemes] = useState([]);
  const [loadingSchemes, setLoadingSchemes] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedScheme, setSelectedScheme] = useState(null); // For detail view modal
  const [editingScheme, setEditingScheme] = useState(null);   // For edit/add form modal
  const [formError, setFormError] = useState('');

  // Admin Workspace Tabs
  const [currentTab, setCurrentTab] = useState('schemes');

  // OCR Queue States
  const [pendingDocs, setPendingDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [reviewingDoc, setReviewingDoc] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Dashboard Stats
  const stats = {
    total: schemes.length,
    active: schemes.filter((s) => s.status === 'active').length,
    archived: schemes.filter((s) => s.status === 'archived').length,
    student: schemes.filter((s) => s.category === 'student').length,
    graduate: schemes.filter((s) => s.category === 'graduate').length,
    startup: schemes.filter((s) => s.category === 'startup').length,
  };

  // Fetch schemes from PostgreSQL via backend APIs
  const fetchSchemes = async () => {
    setLoadingSchemes(true);
    setFetchError('');
    try {
      let url = `${API_BASE}/schemes?`;
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (categoryFilter) url += `category=${encodeURIComponent(categoryFilter)}&`;
      if (statusFilter) url += `status=${encodeURIComponent(statusFilter)}&`;

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch schemes');

      setSchemes(data.data || []);
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoadingSchemes(false);
    }
  };

  const fetchPendingDocs = async () => {
    if (!token) return;
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/admin/documents/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPendingDocs(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch pending documents", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSchemes();
      fetchPendingDocs(); // Fetch for sidebar badge
    }
  }, [token, search, categoryFilter, statusFilter]);

  // Auth Handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginInput),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Invalid credentials');

      setToken(data.token);
      localStorage.setItem('govassist_admin_token', data.token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const clearExpiredToken = () => {
    setToken('');
    localStorage.removeItem('govassist_admin_token');
  };

  const isTokenExpired = (jwtToken) => {
    if (!jwtToken) return true;

    try {
      const parts = jwtToken.split('.');
      if (parts.length < 2) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !payload.exp || payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  };

  useEffect(() => {
    if (token && isTokenExpired(token)) {
      clearExpiredToken();
    }
  }, [token]);

  const handleLogout = () => {
    clearExpiredToken();
  };

  // Add / Edit Handlers
  const handleOpenAdd = () => {
    setEditingScheme({
      scheme_id: '',
      scheme_name: '',
      category: 'student',
      target_group: '',
      min_age: '',
      max_age: '',
      education_min: '',
      max_family_income: '',
      location_scope: 'pan_india',
      employment_status: '',
      benefit_type: '',
      benefit_amount: '',
      documents_required: '',
      application_url: '',
      application_url_status: 'working',
      status: 'active',
    });
    setFormError('');
  };

  const handleOpenEdit = (scheme) => {
    setEditingScheme({
      ...scheme,
      documents_required: Array.isArray(scheme.documents_required)
        ? scheme.documents_required.join('; ')
        : scheme.documents_required || '',
      employment_status: Array.isArray(scheme.employment_status)
        ? scheme.employment_status.join('; ')
        : scheme.employment_status || '',
      min_age: scheme.min_age ?? '',
      max_age: scheme.max_age ?? '',
      max_family_income: scheme.max_family_income ?? '',
      benefit_amount: scheme.benefit_amount ?? '',
    });
    setFormError('');
  };

  const handleSaveScheme = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!token || isTokenExpired(token)) {
      clearExpiredToken();
      setFormError('Your admin session expired. Please sign in again.');
      return;
    }

    const isUpdate = schemes.some((s) => s.scheme_id === editingScheme.scheme_id);
    const method = isUpdate ? 'PUT' : 'POST';
    const url = isUpdate ? `${API_BASE}/schemes/${editingScheme.scheme_id}` : `${API_BASE}/schemes`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editingScheme),
      });

      if (res.status === 401) {
        clearExpiredToken();
        throw new Error('Your admin session expired. Please sign in again.');
      }

      const data = await res.json();
      if (!res.ok) {
        const msg = data.error?.details ? data.error.details.join(', ') : data.error?.message;
        throw new Error(msg || 'Failed to save scheme');
      }

      setEditingScheme(null);
      fetchSchemes();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteScheme = async (scheme) => {
    if (!window.confirm(`Delete scheme "${scheme.scheme_name}"? This cannot be undone.`)) {
      return;
    }

    if (!token || isTokenExpired(token)) {
      clearExpiredToken();
      alert('Your admin session expired. Please sign in again.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/schemes/${scheme.scheme_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        clearExpiredToken();
        throw new Error('Your admin session expired. Please sign in again.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Delete failed');
      }

      fetchSchemes();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Archive / Activate Handler
  const handleToggleStatus = async (scheme) => {
    const nextStatus = scheme.status === 'active' ? 'archived' : 'active';
    try {
      const res = await fetch(`${API_BASE}/schemes/${scheme.scheme_id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.status === 401) {
        clearExpiredToken();
        throw new Error('Your admin session expired. Please sign in again.');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Status update failed');

      fetchSchemes();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // 1. LOGIN SCREEN (If not authenticated)
  if (!token) {
    return (
      <div className="auth-container">
        <div className="card auth-card">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: 'var(--adm-cadet)',
                color: '#fff',
                fontWeight: '800',
                fontSize: '1.5rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
              }}
            >
              GA
            </div>
            <h2>GovAssist Admin Control</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              PostgreSQL Single Source of Truth Scheme Management
            </p>
          </div>

          {loginError && (
            <div className="alert alert-danger">
              <span>⚠️</span> {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Admin Username</label>
              <input
                type="text"
                value={loginInput.username}
                onChange={(e) => setLoginInput({ ...loginInput, username: e.target.value })}
                className="form-control"
                placeholder="admin"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={loginInput.password}
                onChange={(e) => setLoginInput({ ...loginInput, password: e.target.value })}
                className="form-control"
                placeholder="Default: govassist2026"
                required
              />
            </div>

            <button type="submit" disabled={loginLoading} className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
              {loginLoading ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleReviewDoc = async (status) => {
    if (!token || !reviewingDoc || submittingReview) return;
    setSubmittingReview(true);
    const docId = reviewingDoc.id;
    try {
      const res = await fetch(`${API_BASE}/admin/documents/${docId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, adminNotes })
      });
      if (res.ok) {
        // Immediate optimistic UI update
        setPendingDocs(prev => prev.filter(d => d.id !== docId));
        setReviewingDoc(null);
        setAdminNotes('');
        fetchPendingDocs(); // Refresh queue in background
      } else {
        const data = await res.json();
        alert('Review failed: ' + (data.error?.message || data.error || 'Server error'));
      }
    } catch (err) {
      alert('Review error: ' + err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // 2. MAIN ADMIN DASHBOARD
  return (
    <div className="admin-app">
      {/* Sidebar Navigation */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">GA</div>
          <div>
            <h1 className="sidebar-title">GovAssist</h1>
            <p className="sidebar-subtitle">Admin Workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            type="button" 
            className={`nav-item ${currentTab === 'schemes' ? 'active' : ''}`}
            onClick={() => setCurrentTab('schemes')}
          >
            📊 Scheme Management
          </button>
          <button 
            type="button" 
            className={`nav-item ${currentTab === 'ocr' ? 'active' : ''}`}
            onClick={() => setCurrentTab('ocr')}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>📑 Document OCR Hub</span>
            {pendingDocs.length > 0 && (
              <span style={{
                background: 'var(--adm-rose)', 
                color: 'white', 
                borderRadius: '50%', 
                padding: '2px 8px', 
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}>
                {pendingDocs.length}
              </span>
            )}
          </button>
          <button type="button" className="nav-item" onClick={() => alert('ChromaDB/LangChain RAG assistant pipeline ready for Phase 4 integration.')}>
            🤖 RAG Knowledge Base
          </button>
        </nav>

        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout} className="btn btn-outline" style={{ width: '100%' }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="admin-main">
        {/* Top Header */}
        <header className="admin-header">
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Scheme Repository Overview</h2>
          <div className="header-user">
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>System Administrator</span>
            <div className="user-avatar">SA</div>
          </div>
        </header>

        <div className="admin-content">
          {currentTab === 'schemes' && (
            <>
              {/* Dashboard Stats */}
          <div className="stats-grid">
            <div className="card stat-card" style={{ borderColor: 'var(--adm-cadet)' }}>
              <div className="stat-icon" style={{ background: 'var(--adm-lime-light)' }}>
                📚
              </div>
              <div>
                <div className="stat-val">{stats.total}</div>
                <div className="stat-label">Total Schemes</div>
              </div>
            </div>

            <div className="card stat-card" style={{ borderColor: 'var(--adm-periwinkle)' }}>
              <div className="stat-icon" style={{ background: 'var(--adm-rose-light)' }}>
                ✅
              </div>
              <div>
                <div className="stat-val">{stats.active}</div>
                <div className="stat-label">Active Schemes</div>
              </div>
            </div>

            <div className="card stat-card" style={{ borderColor: 'var(--adm-amethyst)' }}>
              <div className="stat-icon" style={{ background: '#FAF0F5' }}>
                🎓
              </div>
              <div>
                <div className="stat-val">{stats.student}</div>
                <div className="stat-label">Student Schemes</div>
              </div>
            </div>

            <div className="card stat-card" style={{ borderColor: 'var(--adm-lavender)' }}>
              <div className="stat-icon" style={{ background: '#F0F5FA' }}>
                🚀
              </div>
              <div>
                <div className="stat-val">{stats.startup}</div>
                <div className="stat-label">Startup Schemes</div>
              </div>
            </div>
          </div>

          {/* Search, Filter Toolbar & Add Action */}
          <div className="card toolbar-card">
            <div className="toolbar-flex">
              <div>
                <h3 style={{ margin: 0 }}>Schemes Master Table</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Manage criteria, benefits, documents, and application URLs stored in PostgreSQL
                </p>
              </div>

              <button type="button" onClick={handleOpenAdd} className="btn btn-primary">
                + Create New Scheme
              </button>
            </div>

            <div className="filter-row">
              <input
                type="text"
                placeholder="Search by Scheme Name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control"
                style={{ flex: 2 }}
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="form-control"
                style={{ flex: 1 }}
              >
                <option value="">All Categories</option>
                <option value="student">Student</option>
                <option value="graduate">Graduate</option>
                <option value="startup">Startup</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-control"
                style={{ flex: 1 }}
              >
                <option value="">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          {fetchError && (
            <div className="alert alert-danger">
              <span>⚠️</span> {fetchError}
            </div>
          )}

          {loadingSchemes ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p>Loading scheme dataset from PostgreSQL APIs...</p>
            </div>
          ) : (
            <div className="card table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scheme ID</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Age Range</th>
                    <th>Max Income</th>
                    <th>Status</th>
                    <th>URL Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schemes.map((scheme) => (
                    <tr key={scheme.scheme_id} className={scheme.status === 'archived' ? 'tr-archived' : ''}>
                      <td>
                        <strong>{scheme.scheme_id}</strong>
                      </td>
                      <td>{scheme.scheme_name}</td>
                      <td>
                        <span className="badge" style={{ background: 'var(--adm-rose)', color: 'var(--text-main)' }}>
                          {scheme.category}
                        </span>
                      </td>
                      <td>
                        {scheme.min_age || scheme.max_age
                          ? `${scheme.min_age || 0} - ${scheme.max_age || '∞'} yrs`
                          : 'Any'}
                      </td>
                      <td>
                        {scheme.max_family_income
                          ? `≤ ₹${Number(scheme.max_family_income).toLocaleString('en-IN')}`
                          : 'No Cap'}
                      </td>
                      <td>
                        <span className={`badge ${scheme.status === 'active' ? 'badge-active' : 'badge-archived'}`}>
                          {scheme.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{scheme.application_url_status}</span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button type="button" onClick={() => setSelectedScheme(scheme)} className="btn btn-outline btn-xs">
                            View
                          </button>
                          <button type="button" onClick={() => handleOpenEdit(scheme)} className="btn btn-secondary btn-xs">
                            Edit
                          </button>
                          <button type="button" onClick={() => handleToggleStatus(scheme)} className="btn btn-outline btn-xs">
                            {scheme.status === 'active' ? 'Archive' : 'Activate'}
                          </button>
                          <button type="button" onClick={() => handleDeleteScheme(scheme)} className="btn btn-danger btn-xs">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>)}

          {currentTab === 'ocr' && (
            <>
              <div className="card toolbar-card">
                <div>
                  <h3 style={{ margin: 0 }}>Pending Manual Document Reviews</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Documents flagged by OCR for suspicious metadata or missing markers.
                  </p>
                </div>
              </div>

              {loadingDocs ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <p>Loading pending queue...</p>
                </div>
              ) : pendingDocs.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <h4 style={{ color: 'var(--adm-emerald)' }}>✅ Queue Empty</h4>
                  <p>No documents require manual review at this time.</p>
                </div>
              ) : (
                <div className="card table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date Uploaded</th>
                        <th>User Email</th>
                        <th>Document Type</th>
                        <th>Flags</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingDocs.map(doc => (
                        <tr key={doc.id}>
                          <td>{new Date(doc.created_at).toLocaleString()}</td>
                          <td><strong>{doc.email || 'Unknown User'}</strong></td>
                          <td>
                            <span className="badge" style={{ background: 'var(--adm-rose)', color: 'var(--text-main)' }}>
                              {doc.document_type_label || doc.document_type}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: 'var(--adm-crimson)' }}>
                              {doc.rejection_reason || 'Requires manual review'}
                            </span>
                          </td>
                          <td>
                            <button 
                              type="button" 
                              className="btn btn-primary btn-xs"
                              onClick={() => setReviewingDoc(doc)}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* VIEW SCHEME DETAILS MODAL */}
      {selectedScheme && (
        <div className="modal-backdrop" onClick={() => setSelectedScheme(null)}>
          <div className="card modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Scheme Details: {selectedScheme.scheme_id}</h3>
              <button type="button" className="close-btn" onClick={() => setSelectedScheme(null)}>
                ✕
              </button>
            </div>

            <div>
              <h4>{selectedScheme.scheme_name}</h4>
              <p><strong>Category:</strong> {selectedScheme.category} | <strong>Status:</strong> {selectedScheme.status}</p>

              <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                <div><strong>Min Age:</strong> {selectedScheme.min_age || 'None'}</div>
                <div><strong>Max Age:</strong> {selectedScheme.max_age || 'None'}</div>
                <div><strong>Min Education:</strong> {selectedScheme.education_min || 'None'}</div>
                <div><strong>Max Family Income:</strong> {selectedScheme.max_family_income ? `₹${selectedScheme.max_family_income}` : 'None'}</div>
                <div><strong>Location Scope:</strong> {selectedScheme.location_scope}</div>
                <div><strong>Employment Status:</strong> {selectedScheme.employment_status?.join(', ') || 'Any'}</div>
              </div>

              <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                <strong>Required Documents:</strong> {selectedScheme.documents_required?.join(', ') || 'None specified'}
              </div>

              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <strong>Application URL:</strong>{' '}
                {selectedScheme.application_url ? (
                  <a href={selectedScheme.application_url} target="_blank" rel="noreferrer">
                    {selectedScheme.application_url}
                  </a>
                ) : (
                  'None'
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT SCHEME FORM MODAL */}
      {editingScheme && (
        <div className="modal-backdrop" onClick={() => setEditingScheme(null)}>
          <div className="card modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{schemes.some((s) => s.scheme_id === editingScheme.scheme_id) ? 'Edit Scheme' : 'Add New Scheme'}</h3>
              <button type="button" className="close-btn" onClick={() => setEditingScheme(null)}>
                ✕
              </button>
            </div>

            {formError && (
              <div className="alert alert-danger">
                <span>⚠️</span> {formError}
              </div>
            )}

            <form onSubmit={handleSaveScheme}>
              <div className="modal-grid">
                <div className="form-group">
                  <label className="form-label">Scheme ID *</label>
                  <input
                    type="text"
                    value={editingScheme.scheme_id}
                    onChange={(e) => setEditingScheme({ ...editingScheme, scheme_id: e.target.value })}
                    className="form-control"
                    disabled={schemes.some((s) => s.scheme_id === editingScheme.scheme_id)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Scheme Name *</label>
                  <input
                    type="text"
                    value={editingScheme.scheme_name}
                    onChange={(e) => setEditingScheme({ ...editingScheme, scheme_name: e.target.value })}
                    className="form-control"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    value={editingScheme.category}
                    onChange={(e) => setEditingScheme({ ...editingScheme, category: e.target.value })}
                    className="form-control"
                    required
                  >
                    <option value="student">Student</option>
                    <option value="graduate">Graduate</option>
                    <option value="startup">Startup</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Location Scope *</label>
                  <select
                    value={editingScheme.location_scope}
                    onChange={(e) => setEditingScheme({ ...editingScheme, location_scope: e.target.value })}
                    className="form-control"
                    required
                  >
                    <option value="pan_india">Pan India</option>
                    <option value="tamil_nadu">Tamil Nadu</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Min Age</label>
                  <input
                    type="number"
                    value={editingScheme.min_age}
                    onChange={(e) => setEditingScheme({ ...editingScheme, min_age: e.target.value })}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Max Age</label>
                  <input
                    type="number"
                    value={editingScheme.max_age}
                    onChange={(e) => setEditingScheme({ ...editingScheme, max_age: e.target.value })}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Max Family Income (₹)</label>
                  <input
                    type="number"
                    value={editingScheme.max_family_income}
                    onChange={(e) => setEditingScheme({ ...editingScheme, max_family_income: e.target.value })}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Min Education</label>
                  <input
                    type="text"
                    value={editingScheme.education_min}
                    onChange={(e) => setEditingScheme({ ...editingScheme, education_min: e.target.value })}
                    className="form-control"
                    placeholder="e.g. B.E / 12th"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Official Application URL</label>
                  <input
                    type="url"
                    value={editingScheme.application_url}
                    onChange={(e) => setEditingScheme({ ...editingScheme, application_url: e.target.value })}
                    className="form-control"
                    placeholder="https://..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">URL Status</label>
                  <select
                    value={editingScheme.application_url_status}
                    onChange={(e) => setEditingScheme({ ...editingScheme, application_url_status: e.target.value })}
                    className="form-control"
                  >
                    <option value="working">Working</option>
                    <option value="needs_verification">Needs Verification</option>
                    <option value="not_tested">Not Tested</option>
                    <option value="not_applicable">Not Applicable</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    value={editingScheme.status}
                    onChange={(e) => setEditingScheme({ ...editingScheme, status: e.target.value })}
                    className="form-control"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Required Documents (Semicolon separated)</label>
                  <input
                    type="text"
                    value={editingScheme.documents_required}
                    onChange={(e) => setEditingScheme({ ...editingScheme, documents_required: e.target.value })}
                    className="form-control"
                    placeholder="e.g. Aadhaar Card; Income Certificate"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setEditingScheme(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Scheme Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* REVIEW DOCUMENT MODAL */}
      {reviewingDoc && (
        <div className="modal-backdrop" onClick={() => setReviewingDoc(null)}>
          <div className="card modal-dialog" style={{ maxWidth: '960px', width: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manual Review: {reviewingDoc.document_type_label || reviewingDoc.document_type}</h3>
              <button type="button" className="close-btn" onClick={() => setReviewingDoc(null)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', height: '65vh' }}>
              {/* Left Side: PDF Preview */}
              <div style={{ background: '#f5f5f5', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <iframe 
                  src={`${API_BASE}/admin/documents/${reviewingDoc.id}/download?token=${token}`} 
                  title="Document Preview"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>

              {/* Right Side: Details & Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>

                  {/* User Info */}
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Citizen</h4>
                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem' }}><strong>Email:</strong> {reviewingDoc.email}</p>
                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem' }}><strong>Category:</strong> {reviewingDoc.category}</p>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}><strong>Uploaded:</strong> {new Date(reviewingDoc.created_at).toLocaleString()}</p>

                  {/* Review Reason */}
                  {reviewingDoc.rejection_reason && (
                    <div style={{ background: '#fdf0f0', border: '1px solid #e8a0a0', borderRadius: '6px', padding: '0.6rem 0.8rem', marginBottom: '1rem' }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--adm-crimson)' }}>Reason for Review:</strong>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{reviewingDoc.rejection_reason}</p>
                    </div>
                  )}

                  {/* Extracted Fields */}
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Extracted Fields</h4>
                  {reviewingDoc.extracted_data && Object.keys(reviewingDoc.extracted_data).length > 0 ? (
                    <table style={{ width: '100%', fontSize: '0.82rem', marginBottom: '1rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        {Object.entries(reviewingDoc.extracted_data).map(([key, value]) => (
                          <tr key={key} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <td style={{ padding: '0.3rem 0.5rem 0.3rem 0', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize', width: '40%' }}>{key.replace(/_/g, ' ')}</td>
                            <td style={{ padding: '0.3rem 0' }}>{value != null ? String(value) : <span style={{ color: '#999' }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ fontSize: '0.82rem', color: '#999', marginBottom: '1rem' }}>No fields extracted.</p>
                  )}

                  {/* Validation Pipeline Results */}
                  {reviewingDoc.validation_results && Object.keys(reviewingDoc.validation_results).length > 0 && (
                    <>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Pipeline Stages</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '1rem' }}>
                        {Object.entries(reviewingDoc.validation_results).map(([stage, info]) => (
                          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                            <span>{info.pass ? '✅' : info.code === 'OK' ? '✅' : '⚠️'}</span>
                            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{stage.replace(/_/g, ' ')}</span>
                            <span style={{ color: '#999' }}>— {info.code}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Admin Notes */}
                  <h4 style={{ color: 'var(--adm-crimson)', margin: '0 0 0.35rem' }}>Admin Notes</h4>
                  <textarea 
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="form-control" 
                    rows="3" 
                    placeholder="Enter reason for rejection or approval notes..."
                  />
                </div>
                
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={submittingReview}
                    style={{ background: 'var(--adm-emerald)', borderColor: 'var(--adm-emerald)', color: 'white', opacity: submittingReview ? 0.7 : 1 }}
                    onClick={() => handleReviewDoc('verified')}
                  >
                    {submittingReview ? 'Processing...' : 'Approve Document'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger"
                    disabled={submittingReview}
                    style={{ opacity: submittingReview ? 0.7 : 1 }}
                    onClick={() => handleReviewDoc('rejected_forged')}
                  >
                    {submittingReview ? 'Processing...' : '❌ Reject (Forged/Invalid)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
