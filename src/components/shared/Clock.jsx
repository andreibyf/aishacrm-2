import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function Clock() {
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-center p-3 rounded-lg">
        <p className="text-sky-400 text-sm font-semibold">Cognitive Relationship Management Platform</p>
        <p className="text-yellow-500 mt-1 text-sm font-extrabold">{format(currentDate, "MMM dd, yyyy")}</p>
        <p className="text-green-400 text-base font-bold">{format(currentDate, "hh:mm:ss a")}</p>
    </div>);

}