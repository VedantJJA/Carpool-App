import React, { useState, useEffect, useMemo } from 'react';
import {
    initializeApp
} from 'firebase/app';
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    signInWithCustomToken,
    signInAnonymously
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    addDoc,
    query,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    arrayUnion,
    setDoc,
    getDoc,
    orderBy,
    limit
} from 'firebase/firestore';
import {
    Car,
    Plane,
    Train,
    Building2,
    Calendar,
    Clock,
    Users,
    Lock,
    Unlock,
    Filter,
    Plus,
    LogOut,
    MapPin,
    ArrowRight,
    UserCircle,
    Info,
    MessageSquare,
    Send
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDKDXpWV2OlUwiyi50l0maSHYbGsSGI2SM",
    authDomain: "carpool2025.firebaseapp.com",
    projectId: "carpool2025",
    storageBucket: "carpool2025.firebasestorage.app",
    messagingSenderId: "164540052080",
    appId: "1:164540052080:web:25cae59e33a7674c86fab5",
    measurementId: "G-XM3WJ81CEV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'vit-carpool-v1';

// --- Constants ---
const DESTINATIONS = [
    { id: 'airport', name: 'Chennai Airport', icon: Plane },
    { id: 'railway', name: 'Railway Station', icon: Train },
    { id: 'mgr', name: 'MGR Station', icon: MapPin },
];

const TIME_SLOTS = [
    "00:00", "01:30", "03:00", "04:30",
    "06:00", "07:30", "09:00", "10:30",
    "12:00", "13:30", "15:00", "16:30",
    "18:00", "19:30", "21:00", "22:30"
];

// --- Helper Functions ---
const generateRoomCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateSerialNumber = () => Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit serial
const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

const extractNameFromEmail = (email) => {
    if (!email) return 'Student';
    // Attempt to parse "firstname.lastname" pattern common in VIT emails
    const prefix = email.split('@')[0];
    const parts = prefix.split('.');
    if (parts.length >= 2) {
        // Remove numbers from the last part (usually year/reg no digits)
        const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        const lastNameRaw = parts[1].replace(/[0-9]/g, '');
        const lastName = lastNameRaw.charAt(0).toUpperCase() + lastNameRaw.slice(1);
        return `${firstName} ${lastName}`;
    }
    return prefix;
};

// --- Components ---

// 1. Login Component
const Login = ({ onLogin, error }) => (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
            <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Car className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">VIT Carpool Planner</h1>
            <p className="text-slate-500 mb-8">Share rides, save money, travel safely.</p>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-200">
                    {error}
                </div>
            )}

            <button
                onClick={onLogin}
                className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-all"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Continue with VIT Email
            </button>
            <p className="mt-4 text-xs text-slate-400">Must use @vitstudent.ac.in account</p>
        </div>
    </div>
);

// 2. Onboarding Component (Gender Only)
const Onboarding = ({ onSubmit, initialName }) => {
    const [gender, setGender] = useState('');

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold text-slate-800 mb-2">Complete Profile</h2>
                <p className="text-slate-500 mb-6 text-sm">Welcome, <span className="font-semibold text-slate-800">{initialName}</span>!</p>

                <div className="mb-8">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Gender</label>
                    <div className="space-y-3">
                        {['Male', 'Female'].map((g) => (
                            <button
                                key={g}
                                onClick={() => setGender(g)}
                                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${gender === g
                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                            >
                                <span className="font-medium">{g}</span>
                                {gender === g && <div className="w-4 h-4 rounded-full bg-blue-600" />}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    disabled={!gender}
                    onClick={() => onSubmit(gender)}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

// 3. Main App Logic
export default function App() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null); // { gender, contact, name }
    const [authError, setAuthError] = useState('');
    const [step, setStep] = useState('loading'); // loading, login, onboarding, selection, rooms

    // Selection State
    const [direction, setDirection] = useState('TO_VIT'); // 'TO_VIT' or 'FROM_VIT'
    const [destination, setDestination] = useState(null);
    const [date, setDate] = useState('');
    const [timeSlot, setTimeSlot] = useState('');

    // Room View State
    const [allRooms, setAllRooms] = useState([]); // All fetched rooms
    const [relevantRooms, setRelevantRooms] = useState([]); // Filtered by dest/date/time
    const [activeTab, setActiveTab] = useState('public'); // public, private
    const [filter, setFilter] = useState('all'); // all, male, female, common
    const [joinCode, setJoinCode] = useState('');

    // Creation State
    const [isCreating, setIsCreating] = useState(false);
    const [createMaxSize, setCreateMaxSize] = useState(4); // Default 4

    // --- Derived State ---
    const userCurrentRoom = useMemo(() => {
        if (!user || allRooms.length === 0) return null;
        return allRooms.find(r => r.members.some(m => m.uid === user.uid));
    }, [allRooms, user]);

    // --- Auth & Data Effects ---

    useEffect(() => {
        // Just listen for auth state
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // Domain Check
                if (currentUser.email && !currentUser.email.endsWith('@vitstudent.ac.in') && !currentUser.isAnonymous) {
                    await signOut(auth);
                    setAuthError("Access restricted to @vitstudent.ac.in emails only.");
                    setUser(null);
                    setStep('login');
                    return;
                }

                setUser(currentUser);
                // Fetch Profile
                const profileRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
                const profileSnap = await getDoc(profileRef);

                if (profileSnap.exists()) {
                    setProfile(profileSnap.data());
                    setStep('selection');
                } else {
                    setStep('onboarding');
                }
            } else {
                setUser(null);
                setStep('login');
            }
        });
        return () => unsubscribe();
    }, []);

    // State restoration effect
    useEffect(() => {
        if (userCurrentRoom && profile) {
            // Restore selection state from the active room
            const destObj = DESTINATIONS.find(d => d.id === userCurrentRoom.destination);
            if (destObj) setDestination(destObj);

            setDate(userCurrentRoom.date);
            setTimeSlot(userCurrentRoom.timeSlot);
            if (userCurrentRoom.direction) setDirection(userCurrentRoom.direction);

            // Jump to rooms view
            setStep('rooms');

            // If it's a private room, open the private tab
            if (userCurrentRoom.type === 'private') {
                setActiveTab('private');
            }
        }
    }, [userCurrentRoom, profile]);

    // Fetch All Rooms when authenticated to check membership state
    useEffect(() => {
        if (user) {
            const q = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllRooms(fetchedRooms);
            }, (err) => console.error("Error fetching rooms", err));

            return () => unsubscribe();
        }
    }, [user]);

    // Derive relevant Rooms
    useEffect(() => {
        if (destination && date && timeSlot && allRooms.length > 0) {
            const userTimeMins = timeToMinutes(timeSlot);

            setRelevantRooms(allRooms.filter(r => {
                // Basic Match
                if (r.destination !== destination.id) return false;
                if (r.date !== date) return false;
                if (r.direction !== direction) return false;

                // Time Range Match (+/- 3 hours)
                const roomTimeMins = timeToMinutes(r.timeSlot);
                let diff = Math.abs(roomTimeMins - userTimeMins);

                // Handle midnight crossover (24 hours = 1440 minutes)
                if (diff > 720) { // If difference is more than 12 hours, check the shorter path around midnight
                    diff = 1440 - diff;
                }

                // 3 hours = 180 minutes
                return diff <= 180;
            }));
        } else {
            setRelevantRooms([]);
        }
    }, [allRooms, destination, date, timeSlot, direction]);

    // --- Handlers ---

    const handleLogin = async () => {
        setAuthError('');
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            setAuthError("Login failed. Please try again.");
            console.error(err);
        }
    };

    const handleOnboarding = async (gender) => {
        if (!user) return;
        try {
            // Use Google Display Name or fallback to extraction from email
            const nameToUse = user.displayName || extractNameFromEmail(user.email);

            const profileData = {
                gender,
                email: user.email,
                name: nameToUse
            };

            await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), profileData);
            setProfile(profileData);
            setStep('selection');
        } catch (err) {
            console.error("Profile save error", err);
        }
    };

    const handleCreateRoom = async (type, genderReq = 'Common') => {
        if (!user || !profile) return;

        if (userCurrentRoom) {
            alert("You are already in a room! Please leave your current room before creating a new one.");
            return;
        }

        const newRoom = {
            hostId: user.uid,
            hostName: profile.name, // Keep for metadata, but display Serial #
            direction,
            destination: destination.id,
            date,
            timeSlot,
            type, // 'public' or 'private'
            genderReq, // 'Male Only', 'Female Only', 'Common'
            maxSize: createMaxSize,
            members: [{
                uid: user.uid,
                name: profile.name,
                gender: profile.gender
            }],
            createdAt: new Date().toISOString(),
            code: type === 'private' ? generateRoomCode() : null,
            serialNumber: generateSerialNumber()
        };

        try {
            // Optimistic set step to avoid flicker (though strictly dependent on firebase update)
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), newRoom);
            setIsCreating(false);
            setCreateMaxSize(4); // Reset default
        } catch (err) {
            console.error("Create room error", err);
        }
    };

    const handleJoinRoom = async (roomId, currentMembers) => {
        if (!user || !profile) return;

        // Check if already in this room (redundant but safe)
        if (currentMembers.some(m => m.uid === user.uid)) return;

        // Check if already in ANY room
        if (userCurrentRoom) {
            alert("You are already in a room! Please leave your current room first.");
            return;
        }

        try {
            const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
            await updateDoc(roomRef, {
                members: arrayUnion({
                    uid: user.uid,
                    name: profile.name,
                    gender: profile.gender
                })
            });
        } catch (err) {
            console.error("Join error", err);
        }
    };

    const handleLeaveRoom = async (roomId, currentMembers) => {
        if (!user) return;
        const memberToRemove = currentMembers.find(m => m.uid === user.uid);
        if (!memberToRemove) return;

        try {
            const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

            // If user is the last member, delete the room
            if (currentMembers.length <= 1) {
                await deleteDoc(roomRef);
            } else {
                await updateDoc(roomRef, {
                    members: arrayRemove(memberToRemove)
                });
            }
        } catch (err) {
            console.error("Leave error", err);
        }
    };

    const handleJoinPrivate = () => {
        const room = allRooms.find(r => r.type === 'private' && r.code === joinCode);
        if (room) {
            handleJoinRoom(room.id, room.members);
            setJoinCode('');
        } else {
            alert("Invalid Room Code");
        }
    };

    // --- Render Helpers ---

    const filteredPublicRooms = useMemo(() => {
        let list = relevantRooms.filter(r => r.type === 'public');

        // STRICT GENDER VISIBILITY (Case Implies Title Case, but safety first)
        const userGender = profile?.gender?.toLowerCase();

        if (userGender === 'male') {
            list = list.filter(r => r.genderReq !== 'Female Only');
        } else if (userGender === 'female') {
            list = list.filter(r => r.genderReq !== 'Male Only');
        }

        if (filter === 'Male Only') list = list.filter(r => r.genderReq === 'Male Only');
        if (filter === 'Female Only') list = list.filter(r => r.genderReq === 'Female Only');
        if (filter === 'Common') list = list.filter(r => r.genderReq === 'Common');
        return list;
    }, [relevantRooms, filter, profile]);

    const myPrivateRooms = useMemo(() => {
        return allRooms.filter(r => r.type === 'private' && r.members.some(m => m.uid === user?.uid));
    }, [allRooms, user]);

    // --- Views ---

    if (step === 'loading') return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading VIT Carpool...</div>;
    if (step === 'login') return <Login onLogin={handleLogin} error={authError} />;

    if (step === 'onboarding') {
        const displayInit = user?.displayName || extractNameFromEmail(user?.email);
        return <Onboarding onSubmit={handleOnboarding} initialName={displayInit} />;
    }

    // Selection Screen
    if (step === 'selection') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <header className="bg-white p-4 shadow-sm flex justify-between items-center">
                    <h1 className="font-bold text-blue-600 flex items-center gap-2">
                        <Car size={20} /> VIT Carpool
                    </h1>
                    <button onClick={() => signOut(auth)} className="text-slate-500 hover:text-red-500">
                        <LogOut size={20} />
                    </button>
                </header>

                <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Plan your trip</h2>

                    {/* 0. Direction */}
                    <section className="mb-8">
                        <div className="flex bg-slate-200 p-1 rounded-xl">
                            <button
                                onClick={() => setDirection('TO_VIT')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${direction === 'TO_VIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                To VIT
                            </button>
                            <button
                                onClick={() => setDirection('FROM_VIT')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${direction === 'FROM_VIT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                From VIT
                            </button>
                        </div>
                    </section>

                    {/* 1. Destination */}
                    <section className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">1. Select Destination</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {DESTINATIONS.map((dest) => (
                                <button
                                    key={dest.id}
                                    onClick={() => setDestination(dest)}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${destination?.id === dest.id
                                        ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                                        : 'bg-white border-slate-200 hover:border-blue-300 text-slate-600'
                                        }`}
                                >
                                    <dest.icon size={24} />
                                    <span className="font-medium text-sm">{dest.name}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* 2. Date */}
                    <section className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">2. Select Date</h3>
                        <input
                            type="date"
                            value={date}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full p-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                        />
                    </section>

                    {/* 3. Time */}
                    <section className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">3. Select Time Slot</h3>
                        <div className="grid grid-cols-4 gap-2">
                            {TIME_SLOTS.map((slot) => (
                                <button
                                    key={slot}
                                    onClick={() => setTimeSlot(slot)}
                                    className={`py-2 px-1 rounded-lg border text-sm transition-all ${timeSlot === slot
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                                        }`}
                                >
                                    {slot}
                                </button>
                            ))}
                        </div>
                    </section>

                    <button
                        disabled={!destination || !date || !timeSlot}
                        onClick={() => setStep('rooms')}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all"
                    >
                        Find Rides <ArrowRight size={20} />
                    </button>
                </main>
            </div>
        );
    }

    // Rooms Screen
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white p-4 shadow-sm sticky top-0 z-10">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-4">
                        <button
                            onClick={async () => {
                                if (userCurrentRoom) {
                                    await handleLeaveRoom(userCurrentRoom.id, userCurrentRoom.members);
                                }
                                setStep('selection');
                            }}
                            className="text-slate-500 text-sm hover:text-slate-800 flex items-center gap-1"
                        >
                            ← Back
                        </button>
                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                            <UserCircle size={16} /> {profile.name}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                {direction === 'TO_VIT' ? `${destination.name} → VIT Chennai` : `VIT Chennai → ${destination.name}`}
                            </h1>
                            <p className="text-slate-500 text-sm flex items-center gap-2">
                                <Calendar size={14} /> {date} <Clock size={14} /> {timeSlot}
                            </p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex mt-6 border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab('public')}
                            className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'public' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            Public Rooms
                        </button>
                        <button
                            onClick={() => setActiveTab('private')}
                            className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'private' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            Private Rooms
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 max-w-3xl mx-auto w-full">

                {/* Public Rooms Logic */}
                {activeTab === 'public' && (
                    <>
                        <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
                            {['all', 'Male Only', 'Female Only', 'Common']
                                .filter(f => {
                                    if (!profile?.gender) return true;
                                    const g = profile.gender.toLowerCase();
                                    if (g === 'male' && f === 'Female Only') return false;
                                    if (g === 'female' && f === 'Male Only') return false;
                                    return true;
                                })
                                .map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${filter === f
                                            ? 'bg-slate-800 text-white border-slate-800'
                                            : 'bg-white text-slate-600 border-slate-200'
                                            }`}
                                    >
                                        {f === 'all' ? 'All Rooms' : f}
                                    </button>
                                ))}
                        </div>

                        <div className="space-y-4">
                            {filteredPublicRooms.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Users className="text-slate-400" />
                                    </div>
                                    <p className="text-slate-500">No rooms found.</p>
                                </div>
                            ) : (
                                filteredPublicRooms.map(room => (
                                    <RoomCard
                                        key={room.id}
                                        room={room}
                                        currentUser={user}
                                        onJoin={() => handleJoinRoom(room.id, room.members)}
                                        onLeave={() => handleLeaveRoom(room.id, room.members)}
                                    />
                                ))
                            )}
                        </div>

                        {/* Create Public Room Button */}
                        <button
                            onClick={() => setIsCreating(true)}
                            className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-xl hover:bg-blue-700 transition-all z-20"
                        >
                            <Plus size={24} />
                        </button>
                    </>
                )}

                {/* Private Rooms Logic */}
                {activeTab === 'private' && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-2">Join Private Room</h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value)}
                                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={handleJoinPrivate}
                                    disabled={joinCode.length < 6}
                                    className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                                >
                                    Join
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">My Private Rooms</h3>
                            <button
                                onClick={() => {
                                    setIsCreating(true);
                                    // Note: We might want a tab selector in the modal for private/public if triggered here
                                    // but for now the modal handles 'type' locally if we added it, 
                                    // or we just switch tab in UI. Simplified: Button just opens common modal.
                                }}
                                className="text-blue-600 text-sm font-medium hover:underline"
                            >
                                + Create New
                            </button>
                        </div>

                        <div className="space-y-4">
                            {myPrivateRooms.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-4">You haven't joined any private rooms yet.</p>
                            ) : (
                                myPrivateRooms.map(room => (
                                    <RoomCard
                                        key={room.id}
                                        room={room}
                                        currentUser={user}
                                        onJoin={() => { }} // Already joined
                                        onLeave={() => handleLeaveRoom(room.id, room.members)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Create Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold mb-4">Create Room</h3>

                        {/* Size Selector */}
                        <div className="mb-6">
                            <label className="text-xs text-slate-500 uppercase font-bold mb-2 block">Room Size (2-6)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="2"
                                    max="6"
                                    value={createMaxSize}
                                    onChange={(e) => setCreateMaxSize(parseInt(e.target.value))}
                                    className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="font-bold text-blue-600 w-6">{createMaxSize}</span>
                            </div>
                        </div>

                        <div className="space-y-3 mb-6">
                            <p className="text-sm text-slate-500 mb-2">Select Type</p>

                            {activeTab === 'public' ? (
                                <>
                                    {['Male Only', 'Female Only', 'Common']
                                        .filter(t => {
                                            if (profile.gender === 'Male' && t === 'Female Only') return false;
                                            if (profile.gender === 'Female' && t === 'Male Only') return false;
                                            return true;
                                        })
                                        .map(type => (
                                            <button
                                                key={type}
                                                onClick={() => handleCreateRoom('public', type)}
                                                className="w-full text-left p-3 rounded-lg border hover:bg-slate-50 text-sm font-medium flex justify-between"
                                            >
                                                <span>{type} (Public)</span>
                                                <span className="text-slate-400">→</span>
                                            </button>
                                        ))}
                                </>
                            ) : (
                                <button
                                    onClick={() => handleCreateRoom('private', 'Common')}
                                    className="w-full text-left p-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium flex justify-between"
                                >
                                    <span>Create Private Room</span>
                                    <span className="text-blue-400">→</span>
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                setIsCreating(false);
                                setCreateMaxSize(4);
                            }}
                            className="w-full text-center text-slate-500 text-sm hover:text-slate-800"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component for individual Room Cards
const RoomCard = ({ room, currentUser, onJoin, onLeave }) => {
    const isMember = room.members.some(m => m.uid === currentUser.uid);
    const maxSize = room.maxSize || 4;
    const spotsLeft = maxSize - room.members.length;

    // Tag Styles
    const tagColor = room.genderReq === 'Male Only' ? 'bg-blue-100 text-blue-700' :
        room.genderReq === 'Female Only' ? 'bg-pink-100 text-pink-700' :
            'bg-green-100 text-green-700';

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 relative overflow-hidden">
            {/* Private Badge */}
            {room.type === 'private' && (
                <div className="absolute top-0 right-0 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-bl-lg font-bold flex items-center gap-1">
                    <Lock size={10} /> Code: {room.code}
                </div>
            )}

            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                        {room.hostName[0]}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">Room #{room.serialNumber || room.id.slice(0, 4).toUpperCase()}</p>
                        <p className="text-[10px] text-slate-500 font-medium mb-1">
                            {room.direction === 'TO_VIT'
                                ? `${DESTINATIONS.find(d => d.id === room.destination)?.name || 'Unknown'} → VIT`
                                : `VIT → ${DESTINATIONS.find(d => d.id === room.destination)?.name || 'Unknown'}`}
                        </p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${tagColor}`}>
                            {room.genderReq}
                        </span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-2 font-medium uppercase flex justify-between">
                    <span>Members ({room.members.length}/{maxSize})</span>
                    {!isMember && <span className="text-slate-400 flex items-center gap-1"><Lock size={10} /> Join to see contacts</span>}
                </p>

                <div className="space-y-2">
                    {room.members.map(m => (
                        <div key={m.uid} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-700 font-medium text-xs">{m.name}</span>
                        </div>
                    ))}

                </div>

                {/* Empty Slots */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {Array.from({ length: spotsLeft }).map((_, i) => (
                        <span key={i} className="text-[10px] border border-dashed border-slate-300 px-2 py-1 rounded text-slate-400">
                            Open Slot
                        </span>
                    ))}
                </div>
            </div>

            {isMember && <ChatSection roomId={room.id} user={currentUser} db={db} appId={appId} />}

            {isMember ? (
                <button
                    onClick={onLeave}
                    className="w-full border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors mt-2"
                >
                    Leave Room
                </button>
            ) : (
                <button
                    onClick={onJoin}
                    disabled={spotsLeft === 0}
                    className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {spotsLeft === 0 ? 'Full' : 'Join Room'}
                </button>
            )}
        </div>
    );
};

// Chat Component
const ChatSection = ({ roomId, user, db, appId }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = React.useRef(null);

    useEffect(() => {
        const q = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId, 'messages'),
            orderBy('timestamp', 'asc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
        return () => unsubscribe();
    }, [roomId]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId, 'messages'), {
                text: newMessage,
                senderId: user.uid,
                senderName: user.displayName || 'User',
                timestamp: new Date().toISOString()
            });
            setNewMessage('');
        } catch (err) {
            console.error("Error sending message", err);
        }
    };

    return (
        <div className="border-t border-slate-100 pt-3">
            <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                <MessageSquare size={12} /> Chat
            </h4>
            <div
                ref={scrollRef}
                className="bg-slate-50 rounded-lg p-3 h-40 overflow-y-auto mb-2 space-y-2 text-xs"
            >
                {messages.length === 0 && <p className="text-slate-400 text-center italic">No messages yet. Say hi!</p>}
                {messages.map(msg => {
                    const isMe = msg.senderId === user.uid;
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-2 rounded-lg ${isMe ? 'bg-blue-100 text-blue-900 rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                                {!isMe && <p className="text-[9px] font-bold text-slate-500 mb-0.5">{msg.senderName}</p>}
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
            <form onSubmit={handleSend} className="flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500"
                />
                <button type="submit" className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600">
                    <Send size={14} />
                </button>
            </form>
        </div>
    );
};
