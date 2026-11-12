import { AlertTriangle, CheckCircle2, Coffee, Gamepad2, Hand, Users } from 'lucide-react';
import { resetStats, useStats } from '../utils/stats';

/** สถิติของวันนี้: เก็บในเครื่อง รีเซ็ตเองทุกวัน */
export default function StatsPanel() {
  const s = useStats();
  const tiles = [
    { label: 'งานสำเร็จ', value: s.success, icon: CheckCircle2, color: '#3dbb83', bg: '#e6f6ee' },
    { label: 'ผิดพลาด', value: s.error, icon: AlertTriangle, color: '#e85d75', bg: '#fdebee' },
    { label: 'รอคุณ (ครั้ง)', value: s.attention, icon: Hand, color: '#e0a02c', bg: '#fdf3df' },
    { label: 'กาแฟที่ Agent ดื่ม', value: s.coffee, icon: Coffee, color: '#b9783f', bg: '#f8ece0' },
    { label: 'ไปพักผ่อน (ครั้ง)', value: s.breaks, icon: Gamepad2, color: '#7c5cbf', bg: '#efe8fa' },
    { label: 'ทำงานพร้อมกันสูงสุด', value: s.peak, icon: Users, color: '#3b9ad9', bg: '#e5f2fb' },
  ];
  return (
    <section aria-label="สถิติวันนี้" className="rounded-[18px] border border-[#eadbea] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-sm font-semibold">สถิติวันนี้</h2>
        <button
          type="button"
          onClick={resetStats}
          className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-xs text-[#8b7a9b] hover:bg-[#f6ecf5]"
        >
          ล้าง
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: t.bg }}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80" style={{ color: t.color }}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-xl font-semibold leading-none text-[#3d2f4f]">{t.value}</div>
                <div className="mt-1 truncate text-[11.5px] text-[#6b5a7d]">{t.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
