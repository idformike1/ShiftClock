/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  Settings, 
  Bell, 
  BellOff, 
  Coffee, 
  ArrowRight, 
  Timer,
  Volume2,
  VolumeX
} from 'lucide-react';
import { 
  format, 
  addMinutes, 
  differenceInMinutes, 
  isAfter, 
  parse, 
  isValid,
  startOfToday,
  differenceInSeconds
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface ShiftState {
  inTime: string; // HH:mm
  workdayHours: number;
  workdayMinutes: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  isLocked: boolean;
  isStandard: boolean;
  theme: 'light' | 'dark' | 'system';
}

const DEFAULT_STATE: ShiftState = {
  inTime: '09:00',
  workdayHours: 9,
  workdayMinutes: 30,
  notificationsEnabled: false,
  soundEnabled: true,
  isLocked: false,
  isStandard: true,
  theme: 'system',
};

// --- Main Component ---

export default function App() {
  const [state, setState] = useState<ShiftState>(() => {
    const saved = localStorage.getItem('shift_clock_settings');
    if (saved) {
      try {
        return { ...DEFAULT_STATE, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_STATE;
      }
    }
    return DEFAULT_STATE;
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [notified, setNotified] = useState(false);
  const [warned, setWarned] = useState(false);

  // Theme Logic
  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: 'light' | 'dark') => {
      if (t === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (state.theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(systemDark ? 'dark' : 'light');
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(state.theme);
    }
  }, [state.theme]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('shift_clock_settings', JSON.stringify(state));
  }, [state]);

  // Tick
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate Out Time
  const getOutTime = useCallback(() => {
    if (!state.inTime || !state.inTime.includes(':')) return new Date(NaN);
    const parts = state.inTime.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    
    if (isNaN(h) || isNaN(m)) return new Date(NaN);
    
    const date = startOfToday();
    date.setHours(h, m, 0, 0);
    
    const hours = state.isStandard ? 9 : state.workdayHours;
    const minutes = state.isStandard ? 30 : state.workdayMinutes;
    
    const totalWorkingMinutes = (hours || 0) * 60 + (minutes || 0);
    return addMinutes(date, totalWorkingMinutes);
  }, [state.inTime, state.workdayHours, state.workdayMinutes, state.isStandard]);

  const outTime = getOutTime();
  const inTimeDate = parse(state.inTime, 'HH:mm', startOfToday());
  
  const isValidCalc = isValid(outTime) && isValid(inTimeDate);
  
  const hours = state.isStandard ? 9 : state.workdayHours;
  const minutes = state.isStandard ? 30 : state.workdayMinutes;
  const totalShiftSeconds = (hours * 60 + minutes) * 60;
  
  const elapsedSeconds = isValidCalc ? Math.max(0, differenceInSeconds(currentTime, inTimeDate)) : 0;
  const progress = totalShiftSeconds > 0 ? Math.min(100, (elapsedSeconds / totalShiftSeconds) * 100) : 0;
  
  const remainingSeconds = isValidCalc ? Math.max(0, differenceInSeconds(outTime, currentTime)) : 0;
  const remainingHours = Math.floor(remainingSeconds / 3600);
  const remainingMins = Math.floor((remainingSeconds % 3600) / 60);
  const remainingSecs = remainingSeconds % 60;

  const isOvertime = isValidCalc ? isAfter(currentTime, outTime) : false;

  // Audio Notification Helper
  const playNotificationSound = useCallback((intensity = 'high') => {
    if (!state.soundEnabled) return;
    
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBeep = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      if (intensity === 'high') {
        playBeep(880, now, 0.4); 
        playBeep(1108.73, now + 0.15, 0.4);
        playBeep(1318.51, now + 0.3, 0.6);
      } else {
        // Warning sound (softer)
        playBeep(440, now, 0.3);
        playBeep(554.37, now + 0.2, 0.5);
      }
    } catch (e) {
      console.warn('Audio context blocked or not supported');
    }
  }, [state.soundEnabled]);

  // Notification Logic
  useEffect(() => {
    if (!state.isLocked) return;

    // 15-minute warning
    if (remainingSeconds > 890 && remainingSeconds <= 900 && !warned) {
      if (state.notificationsEnabled && Notification.permission === 'granted') {
        new Notification('Warning: 15 Minutes Left', {
          body: "Your workday is almost over. Finish up your tasks!",
        });
      }
      playNotificationSound('low');
      setWarned(true);
    }

    // Workday Complete
    if (isOvertime && !notified) {
      if (state.notificationsEnabled && Notification.permission === 'granted') {
        new Notification('Workday Complete!', {
          body: "Time to pack up and head out. You've earned it!",
        });
      }
      playNotificationSound('high');
      setNotified(true);
    }
    
    if (!isOvertime) {
      setNotified(false);
    }
    
    // Reset warned if time is reset or changed significantly
    if (remainingSeconds > 910) {
      setWarned(false);
    }

  }, [isOvertime, state.notificationsEnabled, notified, warned, remainingSeconds, playNotificationSound, state.isLocked]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications');
      return;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setState(s => ({ ...s, notificationsEnabled: true }));
    }
  };

  const toggleTheme = () => {
    const modes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const nextIndex = (modes.indexOf(state.theme) + 1) % modes.length;
    setState(s => ({ ...s, theme: modes[nextIndex] }));
  };

  const toggleLock = () => {
    setState(s => ({ ...s, isLocked: !s.isLocked }));
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#0F1113] text-[#1A1C1E] dark:text-[#E6E8EB] font-sans p-4 md:p-6 overflow-hidden flex flex-col items-center justify-center transition-colors duration-300">
      <main className="w-full max-w-sm bg-white dark:bg-[#1A1C1E] rounded-[40px] shadow-2xl p-6 md:p-8 border border-[#E6E8EB] dark:border-[#2D3136] flex flex-col gap-6 relative overflow-hidden transition-colors duration-300">
        {/* Glow effect for status */}
        <motion.div 
          className="absolute -top-24 -right-24 w-48 h-48 blur-[80px] opacity-20 pointer-events-none rounded-full"
          animate={{ 
            backgroundColor: !state.isLocked 
              ? '#3B82F6' 
              : isOvertime 
                ? '#FF6B6B' 
                : progress > 90 
                  ? '#4CAF50' 
                  : '#3B82F6'
          }}
          transition={{ duration: 1 }}
        />

        {/* Header: Date and Live Clock */}
        <header className="flex justify-between items-center border-b border-gray-50 dark:border-[#2D3136] pb-4">
          <div>
            <h1 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#8E9299]">ShiftFlow</h1>
            <div className="text-base font-medium">{isValid(currentTime) ? format(currentTime, 'EEE, MMM dd') : '--'}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-[#8E9299]">Live Clock</div>
            <div className="text-lg font-medium tabular-nums">{isValid(currentTime) ? format(currentTime, 'hh:mm a') : '--'}</div>
          </div>
        </header>

        {/* Primary Goal Indicator / Widget Mode */}
        <div className="flex flex-col items-center gap-2 py-2">
           {state.isLocked ? (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="w-full bg-[#F8F9FA] dark:bg-[#232629] p-6 rounded-[32px] border border-gray-100 dark:border-transparent"
             >
                <div className="flex justify-between items-center mb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#8E9299] font-bold">Shift Progress</div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOvertime ? 'bg-[#FF6B6B]' : 'bg-blue-500'}`} />
                    <span className="text-[10px] font-bold text-gray-400 capitalize">{isOvertime ? 'Overtime' : 'Active'}</span>
                  </div>
                </div>

                <div className={`text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-center ${isOvertime ? 'text-[#FF6B6B]' : 'text-[#1A1C1E] dark:text-white'}`}>
                  {isOvertime ? '+' : ''}{remainingHours}:{remainingMins < 10 ? `0${remainingMins}` : remainingMins}
                  <span className="text-2xl ml-2 opacity-30">{remainingSecs < 10 ? `0${remainingSecs}` : remainingSecs}</span>
                </div>

                <div className="w-full h-3 bg-gray-200 dark:bg-[#121417] rounded-full mt-6 overflow-hidden">
                  <motion.div 
                    className="h-full"
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${progress}%`,
                      backgroundColor: isOvertime 
                        ? '#FF6B6B' 
                        : progress > 90 
                          ? '#4CAF50' 
                          : progress > 50 
                            ? '#3B82F6' 
                            : '#8E9299'
                    }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{Math.round(progress)}% done</p>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Goal: {state.isStandard ? '9:30' : `${state.workdayHours}h ${state.workdayMinutes}m`}</p>
                </div>
             </motion.div>
           ) : (
             <div className="text-center py-6">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#8E9299] mb-4 font-bold">Total Work Hours</div>
                <div className="flex items-center justify-center gap-2 mb-6">
                   <div className="flex items-center gap-2 text-3xl font-light">
                      <input 
                        type="number"
                        value={state.isStandard ? 9 : state.workdayHours}
                        disabled={state.isStandard}
                        onChange={(e) => setState(s => ({ ...s, workdayHours: parseInt(e.target.value) || 0 }))}
                        className="w-12 text-center border-b border-gray-200 dark:border-[#2D3136] focus:border-black dark:focus:border-white p-0 disabled:border-transparent transition-all bg-transparent"
                      />
                      <span className="opacity-40">h</span>
                      <input 
                        type="number"
                        value={state.isStandard ? 30 : state.workdayMinutes}
                        disabled={state.isStandard}
                        onChange={(e) => setState(s => ({ ...s, workdayMinutes: parseInt(e.target.value) || 0 }))}
                        className="w-12 text-center border-b border-gray-200 dark:border-[#2D3136] focus:border-black dark:focus:border-white p-0 disabled:border-transparent transition-all bg-transparent"
                      />
                      <span className="opacity-40">m</span>
                   </div>
                </div>
                
                <div className="flex gap-2 justify-center">
                   <button 
                     onClick={() => setState(s => ({ ...s, isStandard: true }))}
                     className={`px-4 py-2 text-[10px] font-bold rounded-full transition-all border ${state.isStandard ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-transparent text-gray-400 border-gray-200 dark:border-[#2D3136] hover:border-gray-500'}`}
                   >
                     9:30 (STD)
                   </button>
                   <button 
                     onClick={() => setState(s => ({ ...s, isStandard: false }))}
                     className={`px-4 py-2 text-[10px] font-bold rounded-full transition-all border ${!state.isStandard ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-transparent text-gray-400 border-gray-200 dark:border-[#2D3136] hover:border-gray-500'}`}
                   >
                     CUSTOM
                   </button>
                </div>
             </div>
           )}
        </div>

        {/* Punch In / Target Layout */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-[#F8F9FA] dark:bg-[#232629] rounded-[24px] p-4 flex flex-col gap-1 relative overflow-hidden">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#8E9299]">Arrival</span>
              <div className="flex items-center w-full">
                <input 
                  type="time" 
                  value={state.inTime}
                  disabled={state.isLocked}
                  onChange={(e) => setState(s => ({ ...s, inTime: e.target.value }))}
                  className="text-xl md:text-2xl font-light tracking-tight bg-transparent border-none p-0 focus:outline-none cursor-pointer disabled:cursor-not-allowed w-full dark:text-white appearance-none"
                />
              </div>
            </div>
            <div className="bg-[#1A1C1E] dark:bg-[#121417] rounded-[24px] p-4 flex flex-col gap-1 text-white border border-transparent dark:border-[#2D3136] relative overflow-hidden">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#8E9299]">Target Out</span>
              <div className="text-xl md:text-2xl font-light tracking-tight tabular-nums truncate">
                {isValid(outTime) ? (
                  <div className="flex items-baseline gap-0.5">
                    {format(outTime, 'hh:mm')}
                    <span className="text-[10px] opacity-50 uppercase">{format(outTime, 'a')}</span>
                  </div>
                ) : '--:--'}
              </div>
            </div>
          </div>
        </div>

        {/* Main Action Button */}
        <button 
          onClick={toggleLock}
          className={`w-full py-4 rounded-[24px] font-bold text-xs tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-3 ${state.isLocked ? 'bg-gray-100 dark:bg-[#232629] text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-[#2D3136]' : 'bg-[#1A1C1E] dark:bg-white text-white dark:text-[#1A1C1E] shadow-xl scale-100 hover:scale-[1.02] active:scale-[0.98]'}`}
        >
          {state.isLocked ? <Settings size={18} /> : <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />}
          {state.isLocked ? 'Unlock Settings' : 'Lock & Start Pulse'}
        </button>

        {/* Footer Settings Row */}
        <div className="flex justify-between items-center pt-2 px-1">
          <div className="flex gap-3">
            <button 
              onClick={() => setState(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
              className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${state.soundEnabled ? 'text-black dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}
            >
              {state.soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />} SOUND
            </button>
            <button 
              onClick={state.notificationsEnabled ? () => setState(s => ({ ...s, notificationsEnabled: false })) : requestNotificationPermission}
              className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${state.notificationsEnabled ? 'text-[#4CAF50]' : 'text-gray-300 dark:text-gray-600'}`}
            >
              <Bell size={12} /> ALERTS
            </button>
            <button 
              onClick={toggleTheme}
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#8E9299] hover:text-black dark:hover:text-white transition-colors"
            >
              {state.theme === 'system' ? 'AUTO' : state.theme.toUpperCase()}
            </button>
          </div>
          <span className="text-[8px] text-gray-300 dark:text-gray-600 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px]">SF-MOBILE</span>
        </div>
      </main>
      
      <p className="mt-6 text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em] font-medium block">
        Android Optimized Widget UI
      </p>
    </div>
  );
}

