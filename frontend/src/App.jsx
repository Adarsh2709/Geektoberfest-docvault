import { useState, useEffect } from "react";
import api,{
  getDocuments,
  getFolders,
  uploadDocument,
  deleteDocument,
  getDocumentDetails,
  createFolder,
  renameFolder,
  deleteFolder,
  searchDocuments,
  login,
  register,
  getMe,
  getAuditLogs,
} from "./api";
import {
  FiDownload,
  FiTrash2,
  FiFolder,
  FiFile,
  FiUpload,
  FiSearch,
  FiFolderPlus,
  FiEdit2,
  FiLogOut,
  FiUser,
  FiShield,
  FiInfo,
  FiX,
} from "react-icons/fi";

function folderErrorMessage(err, fallback) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((error) => error.msg).join("; ") || fallback;
  }
  return fallback;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(null);

  // Auth States
  const [isLoginView, setIsLoginView] = useState(true);
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // App States
  const [selectedFileType, setSelectedFileType] = useState("all");
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderError, setCreateFolderError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameFolderError, setRenameFolderError] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [detailsDoc, setDetailsDoc] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      fetchMe();
    } else {
      localStorage.removeItem("token");
      setUser(null);
    }
  }, [token]);

  const fetchMe = async () => {
    try {
      const res = await getMe();
      setUser(res.data);
      fetchDocuments();
      fetchFolders();
    } catch (err) {
      console.error(err);
      setToken(null); // Invalid token
    }
  };

  // supporting both filter and sort query params
  const fetchDocuments = async () => {
    if (!token) return;
    try {
      if (searchQuery) {
        const res = await searchDocuments(searchQuery);
        setDocuments(res.data);
        return;
      }

      const params = new URLSearchParams();
      if (selectedFileType && selectedFileType !== "all") {
        params.append("file_type", selectedFileType);
      }
      if (sortBy && sortBy !== "date_desc") {
        params.append("sort_by", sortBy);
      }

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await api.get(`/documents/${queryString}`);
      setDocuments(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch documents");
    }
  };

  const fetchFolders = async () => {
    if (!token) return;
    try {
      const res = await getFolders();
      setFolders(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch folders");
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await getAuditLogs();
      setAuditLogs(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch audit logs");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchDocuments();
  }, [searchQuery, selectedFileType, sortBy]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (isLoginView) {
        const res = await login(authUsername, authPassword);
        setToken(res.data.access_token);
      } else {
        await register(authUsername, authEmail, authPassword);
        setIsLoginView(true);
        setAuthError("Registration successful. Please log in.");
      }
    } catch (err) {
      console.error(err);
      setAuthError(err.response?.data?.detail || "Authentication failed");
    }
  };

  const handleLogout = () => {
    setToken(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (selectedFolder) {
      formData.append("folder_id", selectedFolder);
    }

    try {
      await uploadDocument(formData);
      setUploadFile(null);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Upload failed");
    }
  };

  const handleDeleteDoc = async (id) => {
    try {
      await deleteDocument(id);
      fetchDocuments();
    } catch (err) {
      console.error(err);
      setError("Failed to delete document");
    }
  };

  const handleViewDetails = async (doc) => {
    setDetailsDoc(doc);
    setDetailsError("");
    setLoadingDetails(true);
    try {
      const res = await getDocumentDetails(doc.id);
      setDetailsDoc(res.data);
    } catch (err) {
      console.error(err);
      setDetailsError(err.response?.data?.detail || "Failed to load document metadata");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    setCreateFolderError("");
    if (!newFolderName.trim()) {
      setCreateFolderError("Folder name cannot be empty or whitespace-only");
      return;
    }
    setCreatingFolder(true);
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName("");
      fetchFolders();
    } catch (err) {
      console.error(err);
      setCreateFolderError(folderErrorMessage(err, "Failed to create folder"));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (e) => {
    e.preventDefault();
    setRenameFolderError("");
    if (!renameFolderName.trim()) {
      setRenameFolderError("Folder name cannot be empty or whitespace-only");
      return;
    }
    setRenamingFolder(true);
    try {
      const res = await renameFolder(editingFolderId, renameFolderName.trim());
      setFolders((current) =>
        current.map((folder) => folder.id === res.data.id ? res.data : folder)
      );
      setEditingFolderId(null);
    } catch (err) {
      setRenameFolderError(folderErrorMessage(err, "Failed to rename folder"));
    } finally {
      setRenamingFolder(false);
    }
  };

  const handleDeleteFolder = async (id) => {
    try {
      await deleteFolder(id);
      if (selectedFolder === id) setSelectedFolder(null);
      fetchFolders();
      fetchDocuments();
    } catch (err) {
      console.error(err);
      setError("Failed to delete folder");
    }
  };

  const filteredDocuments = selectedFolder
    ? documents.filter((doc) => doc.folder_id === selectedFolder)
    : documents;

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md border">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-indigo-600 flex items-center justify-center gap-2">
              <FiFolder /> DocVault
            </h1>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">
              {isLoginView ? "Sign in to your account" : "Create a new account"}
            </h2>
          </div>
          <form className="space-y-4" onSubmit={handleAuth}>
            {authError && (
              <div
                className={`p-3 rounded text-sm ${authError.includes("successful") ? "bg-green-50 text-green-700 border-green-500" : "bg-red-50 text-red-700 border-red-500"} border-l-4`}
              >
                {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
              />
            </div>
            {!isLoginView && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isLoginView ? "Sign in" : "Register"}
            </button>
          </form>
          <div className="mt-6 text-center text-sm">
            <button
              onClick={() => {
                setIsLoginView(!isLoginView);
                setAuthError("");
              }}
              className="text-indigo-600 hover:text-indigo-500"
            >
              {isLoginView
                ? "Need an account? Register"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 flex items-center gap-2">
          <FiFolder className="text-indigo-500" /> DocVault
        </h1>
        <div className="relative w-1/3">
          <FiSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
              <FiUser /> {user.username}
            </span>
          )}
          <button
            onClick={() => {
              setShowAudit(true);
              fetchAuditLogs();
            }}
            className="text-gray-500 hover:text-indigo-600 flex items-center gap-1 text-sm font-medium"
          >
            <FiShield /> Audit Log
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium"
          >
            <FiLogOut /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 flex gap-8">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0">
          <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FiFolder /> Folders
            </h2>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedFolder === null ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-gray-100"}`}
                >
                  All Documents
                </button>
              </li>
              {folders.map((folder) => (
                <li key={folder.id}>
                  {editingFolderId === folder.id ? (
                    <form onSubmit={handleRenameFolder} className="space-y-2">
                      <input
                        aria-label="Rename folder"
                        aria-invalid={Boolean(renameFolderError)}
                        aria-describedby={
                          renameFolderError ? "rename-folder-error" : undefined
                        }
                        autoFocus
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={renameFolderName}
                        disabled={renamingFolder}
                        onChange={(e) => {
                          setRenameFolderName(e.target.value);
                          setRenameFolderError("");
                        }}
                      />
                      {renameFolderError && (
                        <p id="rename-folder-error" role="alert" className="text-sm text-red-700">
                          {renameFolderError}
                        </p>
                      )}
                      <div className="flex gap-2 text-sm">
                        <button
                          type="submit"
                          disabled={renamingFolder}
                          className="bg-indigo-600 text-white rounded px-2 py-1 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={renamingFolder}
                          onClick={() => setEditingFolderId(null)}
                          className="rounded px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center group">
                      <button
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg transition-colors truncate ${selectedFolder === folder.id ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-gray-100"}`}
                      >
                        {folder.name}
                      </button>
                      <button
                        type="button"
                        disabled={renamingFolder}
                        onClick={() => {
                          setEditingFolderId(folder.id);
                          setRenameFolderName(folder.name);
                          setRenameFolderError("");
                        }}
                        className="text-gray-400 hover:text-indigo-600 p-2"
                        aria-label={`Rename ${folder.name}`}
                        title="Rename folder"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-2"
                        title="Delete folder"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <form onSubmit={handleCreateFolder} className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="New folder..."
                aria-label="New folder name"
                aria-invalid={Boolean(createFolderError)}
                aria-describedby={createFolderError ? "create-folder-error" : undefined}
                disabled={creatingFolder}
                className="flex-1 border w-full rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  setCreateFolderError("");
                }}
              />
              <button
                type="submit"
                aria-label="Create folder"
                disabled={creatingFolder}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-1.5 rounded"
              >
                <FiFolderPlus />
              </button>
            </form>
            {createFolderError && (
              <p id="create-folder-error" role="alert" className="mt-2 text-sm text-red-700">
                {createFolderError}
              </p>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded shadow-sm flex justify-between">
              <p>{error}</p>
              <button onClick={() => setError("")} className="font-bold">
                &times;
              </button>
            </div>
          )}

          <div className="bg-white p-6 rounded-xl shadow-sm border mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Upload Document</h2>
              <p className="text-sm text-gray-500">Max size: 10MB</p>
            </div>
            <form onSubmit={handleUpload} className="flex items-center gap-4">
              <input
                type="file"
                className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                onChange={(e) => setUploadFile(e.target.files[0])}
              />
              <button
                type="submit"
                disabled={!uploadFile}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FiUpload /> Upload
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {/* Filter and Sort Controls */}
            <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-700">Documents</span>
              <div className="flex items-center gap-4">
                {/* File Type Filter */}
                <div className="flex items-center gap-2">
                  <label htmlFor="fileTypeFilter" className="text-xs font-medium text-gray-600">
                    Type:
                  </label>
                  <select
                    id="fileTypeFilter"
                    value={selectedFileType}
                    onChange={(e) => setSelectedFileType(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Types</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Images</option>
                    <option value="text">Text / Docs</option>
                  </select>
                </div>

                {/* Sort By Control */}
                <div className="flex items-center gap-2">
                  <label htmlFor="sortByFilter" className="text-xs font-medium text-gray-600">
                    Sort:
                  </label>
                  <select
                    id="sortByFilter"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="date_desc">Newest First</option>
                    <option value="date_asc">Oldest First</option>
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                  </select>
                </div>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-600 text-sm">
                  <th className="p-4 font-semibold">Filename</th>
                  <th className="p-4 font-semibold">Size</th>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-500">
                        <FiFile className="w-12 h-12 text-gray-300 mb-3" />
                        <h3 className="text-base font-semibold text-gray-700">No documents yet</h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm">
                          {searchQuery
                            ? `No documents match "${searchQuery}". Try a different keyword.`
                            : selectedFolder
                            ? "This folder is currently empty. Upload a file above to add it here."
                            : "Your vault is empty. Select a file using the form above to get started!"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4 flex items-center gap-3 overflow-hidden">
                        <FiFile className="text-gray-400 text-xl flex-shrink-0" />
                        <span
                          className="font-medium text-gray-800 truncate"
                          title={doc.original_filename}
                        >
                          {doc.original_filename}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                        {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleViewDetails(doc)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Document details & metadata"
                            aria-label={`View details for ${doc.original_filename}`}
                          >
                            <FiInfo />
                          </button>
                          <a
                            href={`${API_URL}/documents/${doc.id}/download?token=${token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Download"
                          >
                            <FiDownload />
                          </a>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Audit Log slide-over panel ── */}
      {showAudit && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          aria-modal="true"
          role="dialog"
          aria-label="Audit Log"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowAudit(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FiShield className="text-indigo-500" /> Audit Log
              </h2>
              <button
                onClick={() => setShowAudit(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
                aria-label="Close audit log"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {auditLoading ? (
                <p className="text-center text-gray-400 py-8">Loading…</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No audit events yet.</p>
              ) : (
                <ul className="space-y-3">
                  {auditLogs.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50"
                    >
                      {/* Action badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide shrink-0 ${
                          entry.action === "upload"
                            ? "bg-green-100 text-green-700"
                            : entry.action === "download"
                            ? "bg-blue-100 text-blue-700"
                            : entry.action === "delete"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {entry.action}
                      </span>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium text-gray-800 truncate"
                          title={entry.target_name}
                        >
                          {entry.target_name ?? `${entry.target_type} #${entry.target_id}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.created_at).toLocaleString()}
                          {entry.ip_address && (
                            <span className="ml-2 text-gray-300">· {entry.ip_address}</span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Refresh footer */}
            <div className="px-6 py-3 border-t flex justify-end">
              <button
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Document Metadata Details Modal ── */}
      {detailsDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4 pb-3 border-b">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiInfo className="text-indigo-600" />
                Document Details
              </h3>
              <button
                onClick={() => setDetailsDoc(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
                aria-label="Close details"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {detailsError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
                {detailsError}
              </div>
            )}

            {loadingDetails ? (
              <p className="text-center text-gray-500 py-8">Loading metadata...</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                    Filename
                  </span>
                  <p className="text-sm font-medium text-gray-900 break-words mt-0.5">
                    {detailsDoc.original_filename || "Untitled document"}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      File Size
                    </span>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {detailsDoc.file_size
                        ? `${(detailsDoc.file_size / 1024 / 1024).toFixed(2)} MB (${detailsDoc.file_size.toLocaleString()} bytes)`
                        : "Unknown size"}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      File Type / MIME
                    </span>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                      {detailsDoc.content_type || "Unknown / Not specified"}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      Upload Date
                    </span>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {detailsDoc.created_at
                        ? new Date(detailsDoc.created_at).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                      Location Folder
                    </span>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                      {folders.find((f) => f.id === detailsDoc.folder_id)?.name || "Vault Root (No folder)"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-3 border-t flex justify-end">
              <button
                onClick={() => setDetailsDoc(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
