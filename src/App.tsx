import './App.css'
import Television from '../Components/Television';
import GamePad from '../Components/GamePad';
import { useEffect, useState } from 'react';

function App() {
  const [isMonitor, setIsMonitor] = useState(window.innerWidth > 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMonitor(window.innerWidth > 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  
  return (
    <div className='app'>
      {isMonitor ? <Television /> : <GamePad />}
    </div>
  )
}

export default App
