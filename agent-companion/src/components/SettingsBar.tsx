import { Bell, BellOff, Clock, Moon, Sun, Sunset, Zap } from 'lucide-react';
import { setSceneSettings, useSceneSettings, type TodSetting } from '../utils/sceneSettings';

const TODS: { key: TodSetting; label: string; icon: typeof Sun }[] = [
  { key: 'auto', label: 'อัตโนมัติ (ตามเวลาเครื่อง)', icon: Clock },
  { key: 'day', label: 'กลางวัน', icon: Sun },
  { key: 'sunset', label: 'เย็น', icon: Sunset },
  { key: 'night', label: 'กลางคืน', icon: Moon },
];

const chip =
  'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition';

export default function SettingsBar() {
  const s = useSceneSettings();

  const toggleNotify = async () => {
    if (s.notify) return setSceneSettings({ notify: false });
    // ขอสิทธิ์ Notification ตอนเปิด (ถ้าไม่ให้ ก็ยังมี toast + ชื่อแท็บ)
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    setSceneSettings({ notify: true });
  };

  const denied = 'Notification' in window && Notification.permission === 'denied';

  return (
    <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
      <div role="group" aria-label="เวลาในฉาก" className="inline-flex gap-0.5 rounded-full border border-[#eadbea] bg-white p-0.5">
        {TODS.map((t) => {
          const Icon = t.icon;
          const on = s.tod === t.key;
          return (
            <button
              key={t.key}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={on}
              onClick={() => setSceneSettings({ tod: t.key })}
              className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition ${
                on ? 'bg-[#7c5cbf] text-white' : 'text-[#8b7a9b] hover:bg-[#f6ecf5]'
              }`}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={toggleNotify}
        aria-pressed={s.notify}
        title={denied ? 'เบราว์เซอร์บล็อกการแจ้งเตือนไว้ (ยังเห็น toast + ตัวเลขบนแท็บ)' : 'แจ้งเตือนเมื่อ Agent รอคุณ / ผิดพลาด / สำเร็จ'}
        className={`${chip} ${s.notify ? 'border-[#7c5cbf] bg-[#7c5cbf] text-white' : 'border-[#eadbea] bg-white text-[#6b5a7d] hover:border-[#cdb3d6]'}`}
      >
        {s.notify ? <Bell size={14} /> : <BellOff size={14} />}
        แจ้งเตือน
      </button>
      <button
        type="button"
        onClick={() => setSceneSettings({ low: !s.low })}
        aria-pressed={s.low}
        title="ปิดเงา ลดความละเอียด ลดจำนวนรถและนก — เหมาะกับเครื่องที่ช้า"
        className={`${chip} ${s.low ? 'border-[#e8956a] bg-[#e8956a] text-white' : 'border-[#eadbea] bg-white text-[#6b5a7d] hover:border-[#cdb3d6]'}`}
      >
        <Zap size={14} />
        ประหยัดเครื่อง
      </button>
    </div>
  );
}
