
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  ShieldCheck, 
  MessageSquare, 
  Camera, 
  Send, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  Loader2,
  Plus,
  X,
  User as UserIcon,
  Lock,
  ChevronRight,
  Globe,
  LogOut,
  Clock,
  CheckCircle,
  MessageCircle,
  AlertCircle,
  Briefcase,
  History,
  LayoutDashboard,
  Filter,
  Search,
  Database,
  Info,
  ArrowUpRight,
  UserPlus
} from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types & Interfaces ---

type Status = 'Pending' | 'In Progress' | 'Resolved';
type Urgency = 'Low' | 'Medium' | 'High';

interface UserAccount {
  username: string;
  password: string;
  name: string;
  role: 'user' | 'admin';
}

interface Complaint {
  id: string;
  userId: string;
  userName: string;
  originalText: string;
  englishText: string;
  category: string;
  urgency: Urgency;
  status: Status;
  image: string | null;
  adminComments: { text: string; date: number }[];
  timestamp: number;
}

interface UserSession {
  id: string;
  role: 'admin' | 'user';
  name: string;
}

// --- Persistence Layer ---
const DB_KEY = 'CITY_MITRA_COMPLAINTS_V5';
const USERS_KEY = 'CITY_MITRA_USERS_V5';

const getComplaintsFromStorage = (): Complaint[] => {
  try {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const getUsersFromStorage = (): UserAccount[] => {
  try {
    const data = localStorage.getItem(USERS_KEY);
    // Default Admin Account
    const defaultAdmin: UserAccount = { username: 'admin', password: 'admin123', name: 'Chief Administrator', role: 'admin' };
    const users = data ? JSON.parse(data) : [];
    if (!users.find((u: UserAccount) => u.username === 'admin')) {
      users.push(defaultAdmin);
    }
    return users;
  } catch (e) {
    return [];
  }
};

const saveComplaintsToStorage = (complaints: Complaint[]) => {
  localStorage.setItem(DB_KEY, JSON.stringify(complaints));
};

const saveUsersToStorage = (users: UserAccount[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const CATEGORIES = ['Electricity', 'Water', 'Roads', 'Sanitation', 'Traffic', 'Public Safety', 'General'];

// --- Components ---

const StatusBadge = ({ status }: { status: Status }) => {
  const styles = {
    'Pending': 'bg-slate-100 text-slate-700 border-slate-200',
    'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
    'Resolved': 'bg-emerald-100 text-emerald-700 border-emerald-200'
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[status]}`}>
      {status}
    </span>
  );
};

const UrgencyBadge = ({ urgency }: { urgency: Urgency }) => {
  const styles = {
    'High': 'bg-red-50 text-red-600 border-red-100',
    'Medium': 'bg-amber-50 text-amber-600 border-amber-100',
    'Low': 'bg-green-50 text-green-600 border-green-100'
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[urgency]}`}>
      {urgency} Priority
    </span>
  );
};

const App = () => {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [view, setView] = useState<'auth' | 'dashboard'>('auth');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter States (Admin)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Form States (User)
  const [text, setText] = useState('');
  const [selectedCat, setSelectedCat] = useState('General');
  const [img, setImg] = useState<string | null>(null);

  // Auth States
  const [loginRole, setLoginRole] = useState<'user' | 'admin'>('user');
  const [userVal, setUserVal] = useState('');
  const [passVal, setPassVal] = useState('');
  const [nameVal, setNameVal] = useState('');

  useEffect(() => {
    setComplaints(getComplaintsFromStorage());
  }, []);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const users = getUsersFromStorage();
    if (users.find(u => u.username === userVal)) {
      alert("Username already exists!");
      return;
    }

    const newUser: UserAccount = {
      username: userVal,
      password: passVal,
      name: nameVal || userVal,
      role: 'user'
    };

    const updatedUsers = [...users, newUser];
    saveUsersToStorage(updatedUsers);
    alert("Registration successful! Please login.");
    setAuthMode('login');
    setPassVal('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const users = getUsersFromStorage();
    const foundUser = users.find(u => u.username === userVal && u.password === passVal);

    if (foundUser) {
      if (foundUser.role !== loginRole) {
        alert(`Access Denied: This account is registered as a ${foundUser.role}.`);
        return;
      }
      setCurrentUser({
        id: foundUser.username,
        role: foundUser.role,
        name: foundUser.name
      });
      setView('dashboard');
    } else {
      alert("Invalid credentials!");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('auth');
    setUserVal('');
    setPassVal('');
    setNameVal('');
  };

  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUser) return;

    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [{
            text: `Translate this complaint to professional English and detect urgency (High/Medium/Low). 
            Input: "${text}"
            Return JSON only: {"translated": "...", "urgency": "..."}`
          }]
        }],
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      const newComplaint: Complaint = {
        id: `CIT-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`,
        userId: currentUser.id,
        userName: currentUser.name,
        originalText: text,
        englishText: result.translated || text,
        category: selectedCat,
        urgency: result.urgency || 'Medium',
        status: 'Pending',
        image: img,
        adminComments: [],
        timestamp: Date.now()
      };

      const updated = [newComplaint, ...complaints];
      setComplaints(updated);
      saveComplaintsToStorage(updated);
      
      setText('');
      setImg(null);
    } catch (err) {
      alert('AI Processing Error.');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = (id: string, s: Status) => {
    const updated = complaints.map(c => c.id === id ? { ...c, status: s } : c);
    setComplaints(updated);
    saveComplaintsToStorage(updated);
  };

  const addComment = (id: string, comment: string) => {
    if (!comment.trim()) return;
    const updated = complaints.map(c => 
      c.id === id ? { ...c, adminComments: [...c.adminComments, { text: comment, date: Date.now() }] } : c
    );
    setComplaints(updated);
    saveComplaintsToStorage(updated);
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      const matchesSearch = c.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.englishText.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
      const matchesUrgency = urgencyFilter === 'All' || c.urgency === urgencyFilter;
      const matchesCategory = categoryFilter === 'All' || c.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesUrgency && matchesCategory;
    });
  }, [complaints, searchQuery, statusFilter, urgencyFilter, categoryFilter]);

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden font-['Inter',sans-serif]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-[160px] opacity-20 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-600 rounded-full blur-[160px] opacity-20 translate-y-1/2 -translate-x-1/2" />

        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden">
          <div className="bg-slate-800 p-10 text-center text-white">
            <div className="bg-blue-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-1">City Mitra AI</h1>
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.2em]">Secure Smart City Access</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              <button onClick={() => { setLoginRole('user'); setAuthMode('login'); }} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${loginRole === 'user' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>CITIZEN</button>
              <button onClick={() => { setLoginRole('admin'); setAuthMode('login'); }} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${loginRole === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>OFFICIAL</button>
            </div>

            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {authMode === 'register' && (
                <div className="relative">
                  <UserPlus className="absolute left-4 top-4 text-slate-400" size={18} />
                  <input type="text" placeholder="Full Name" className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 pl-12 rounded-2xl focus:border-blue-500 outline-none text-slate-900 font-bold text-sm" value={nameVal} onChange={e => setNameVal(e.target.value)} required />
                </div>
              )}
              <div className="relative">
                <UserIcon className="absolute left-4 top-4 text-slate-400" size={18} />
                <input type="text" placeholder="Username" className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 pl-12 rounded-2xl focus:border-blue-500 outline-none text-slate-900 font-bold text-sm" value={userVal} onChange={e => setUserVal(e.target.value)} required />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-4 text-slate-400" size={18} />
                <input type="password" placeholder="Password" className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 pl-12 rounded-2xl focus:border-blue-500 outline-none text-slate-900 font-bold text-sm" value={passVal} onChange={e => setPassVal(e.target.value)} required />
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 group text-sm">
                {authMode === 'login' ? 'Sign In' : 'Create Account'} <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            {loginRole === 'user' && (
              <p className="text-center text-xs font-bold text-slate-400">
                {authMode === 'login' ? "New here?" : "Already have an account?"}{' '}
                <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-blue-600 hover:underline">
                  {authMode === 'login' ? 'Register' : 'Login'}
                </button>
              </p>
            )}

            {loginRole === 'admin' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[10px] text-slate-500 font-bold leading-relaxed">
                <p className="uppercase mb-1 text-slate-400">Demo Admin Access:</p>
                <p>ID: admin / Pass: admin123</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-['Inter',sans-serif]">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
            <ShieldCheck className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-black tracking-tighter text-slate-900">CITY MITRA <span className="text-blue-600">PRO</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{currentUser?.role} MODE</span>
            <span className="text-sm font-bold text-slate-800">{currentUser?.name}</span>
          </div>
          <button onClick={handleLogout} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all ml-4">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10 space-y-10">
        {currentUser?.role === 'user' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-8">
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200">
                <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-blue-600 rounded-full" /> New Report
                </h2>
                <form onSubmit={submitComplaint} className="space-y-4">
                  <textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl h-40 outline-none focus:border-blue-500 text-slate-900 font-bold text-sm resize-none" placeholder="Hinglish/Hindi/English - Describe issue..." value={text} onChange={e => setText(e.target.value)} required />
                  <div className="grid grid-cols-2 gap-4">
                    <select value={selectedCat} onChange={e => setSelectedCat(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 p-3.5 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-blue-500">
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <div className="relative group">
                      <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = () => setImg(r.result as string); r.readAsDataURL(file); }}} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      <div className={`h-full border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${img ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-slate-200 text-slate-400'}`}>
                        {img ? <CheckCircle size={14} /> : <Camera size={14} />} {img ? 'Photo Attached' : 'Add Image'}
                      </div>
                    </div>
                  </div>
                  <button disabled={loading} className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-xs">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} FILE COMPLAINT
                  </button>
                </form>
              </div>
              <div className="bg-blue-600 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
                <Globe className="absolute -right-10 -bottom-10 w-40 h-40 opacity-10" />
                <div className="flex items-center gap-3 mb-3">
                  <Database size={20} />
                  <h3 className="font-black text-sm">Offline Database</h3>
                </div>
                <p className="text-blue-100 text-[11px] font-medium leading-relaxed">Account and reports are stored locally. Syncing active.</p>
              </div>
            </div>
            <div className="lg:col-span-7 space-y-6">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                <History className="text-blue-600" /> My Submissions
              </h2>
              <div className="space-y-4">
                {complaints.filter(c => c.userId === currentUser.id).length === 0 ? (
                  <div className="bg-white rounded-[2rem] p-20 text-center border-2 border-dashed border-slate-200 text-slate-400 font-black text-xs">NO REPORTS FOUND</div>
                ) : (
                  complaints.filter(c => c.userId === currentUser.id).map(c => (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:shadow-xl transition-all border-l-8 border-l-blue-600 group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-2">
                          <UrgencyBadge urgency={c.urgency} />
                          <span className="bg-slate-50 text-slate-400 border border-slate-100 px-3 py-1 rounded-full text-[9px] font-black uppercase">{c.category}</span>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <p className="text-base font-black text-slate-800 leading-tight mb-1 tracking-tight">"{c.originalText}"</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(c.timestamp).toLocaleString()}</p>
                        </div>
                        {c.image && <img src={c.image} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-md" alt="evidence" />}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
                <LayoutDashboard className="text-blue-600" /> ADMIN DASHBOARD
              </h2>
              <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-2">
                <input type="text" placeholder="Search..." className="bg-slate-50 border-none px-4 py-2 rounded-lg text-xs font-bold w-40 outline-none" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <select className="bg-slate-50 border-none px-3 py-2 rounded-lg text-[9px] font-black uppercase outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value as Status | 'All')}>
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">Working</option>
                  <option value="Resolved">Fixed</option>
                </select>
              </div>
            </header>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { l: 'New', c: complaints.filter(c => c.status === 'Pending').length, cl: 'text-slate-900' },
                { l: 'Active', c: complaints.filter(c => c.status === 'In Progress').length, cl: 'text-blue-600' },
                { l: 'Done', c: complaints.filter(c => c.status === 'Resolved').length, cl: 'text-emerald-500' },
                { l: 'High', c: complaints.filter(c => c.urgency === 'High' && c.status !== 'Resolved').length, cl: 'text-red-500' }
              ].map((s, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{s.l}</p>
                  <p className={`text-3xl font-black ${s.cl}`}>{s.c}</p>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {filteredComplaints.map(c => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden flex flex-col lg:flex-row shadow-sm hover:shadow-xl transition-all border-l-8 border-l-slate-800">
                  <div className="flex-1 p-8 space-y-6">
                    <div className="flex justify-between items-center">
                      <UrgencyBadge urgency={c.urgency} />
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">ID: {c.id} • {c.userName}</span>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">Citizen Raw Text</label>
                        <div className="bg-slate-50 p-4 rounded-xl text-slate-600 font-bold text-sm italic">"{c.originalText}"</div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1">AI Formal Analysis</label>
                        <div className="bg-blue-50 p-4 rounded-xl font-black text-blue-900 text-sm">"{c.englishText}"</div>
                      </div>
                    </div>
                  </div>
                  <div className="lg:w-72 bg-slate-50 border-l border-slate-200 p-8 space-y-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase">Status</label>
                      <div className="flex flex-col gap-1.5">
                        {(['Pending', 'In Progress', 'Resolved'] as Status[]).map(s => (
                          <button key={s} onClick={() => updateStatus(c.id, s)} className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${c.status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-400'}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase">Response</label>
                      <input type="text" placeholder="Add remark..." className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-[10px] font-bold outline-none focus:border-blue-500" onKeyDown={(e) => { if (e.key === 'Enter') { addComment(c.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
