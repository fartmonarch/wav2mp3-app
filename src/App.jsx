import React, { useState, useRef } from "react";
import { Mp3Encoder } from "lamejs";
import "./App.css";

export default function App() {
  const [bitrate, setBitrate] = useState(128);
  const [logs, setLogs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [conversionProgress, setConversionProgress] = useState({});
  const audioCtxRef = useRef(null);

  function log(msg) {
    setLogs((l) => [...l, `${new Date().toLocaleTimeString()} ${msg}`]);
  }

  function updateProgress(filename, progress, current, total) {
    setConversionProgress(prev => ({
      ...prev,
      [filename]: {
        progress: Math.min(100, Math.max(0, progress)),
        current,
        total,
        status: progress >= 100 ? 'completed' : 'converting'
      }
    }));
  }

  async function convertWavToMp3(arrayBuffer, kbps = 128, filename) {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const audioCtx = audioCtxRef.current;

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const numChannels = Math.max(1, audioBuffer.numberOfChannels);
    const sampleRate = audioBuffer.sampleRate || 44100;

    const leftF = audioBuffer.getChannelData(0);
    const rightF = numChannels > 1 ? audioBuffer.getChannelData(1) : leftF;

    const left16 = floatTo16BitPCM(leftF);
    const right16 = floatTo16BitPCM(rightF);

    const mp3encoder = new Mp3Encoder(2, sampleRate, kbps);
    const chunkSize = 1152;
    const mp3Data = [];
    
    // 初始化进度
    updateProgress(filename, 0, 0, left16.length);

    for (let i = 0; i < left16.length; i += chunkSize) {
      const leftChunk = left16.subarray(i, i + chunkSize);
      const rightChunk = right16.subarray(i, i + chunkSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf && mp3buf.length > 0) mp3Data.push(mp3buf);
      
      // 更新进度
      const progress = Math.round((i / left16.length) * 100);
      updateProgress(filename, progress, i, left16.length);
      
      await sleep(0); // 让出控制权，避免阻塞UI
    }
    
    const end = mp3encoder.flush();
    if (end && end.length > 0) mp3Data.push(end);

    // 完成进度
    updateProgress(filename, 100, left16.length, left16.length);
    
    return new Blob(mp3Data, { type: "audio/mp3" });
  }

  function floatTo16BitPCM(float32Array) {
    const l = float32Array.length;
    const out = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function handleFiles(e) {
    setLogs([]);
    setOutputs([]);
    setConversionProgress({});
    const inFiles = e.target.files ? Array.from(e.target.files) : [];
    
    for (const f of inFiles) {
      log(`开始转换：${f.name}`);
      try {
        const buf = await f.arrayBuffer();
        const blob = await convertWavToMp3(buf, bitrate, f.name);
        const url = URL.createObjectURL(blob);
        setOutputs((o) => [...o, { name: f.name.replace(/\.wav$/i, ".mp3"), url }]);
        log(`完成：${f.name} -> ${Math.round(blob.size / 1024)} KB`);
        
        // 转换完成后清除进度条（可选，或者保留显示100%）
        setTimeout(() => {
          setConversionProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[f.name];
            return newProgress;
          });
        }, 2000); // 2秒后清除进度条
        
      } catch (err) {
        log(`ERROR converting ${f.name}: ${String(err)}`);
        // 错误时清除进度
        setConversionProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[f.name];
          return newProgress;
        });
      }
    }
  }

  // 获取当前正在转换的文件
  const convertingFiles = Object.keys(conversionProgress);

  return (
    <div className="app-container">
      <header>
        <h1>🎵 WAV → MP3 转换器</h1>
      </header>

      <div className="controls">
        <div className="bitrate-selector">
          <label>比特率：</label>
          <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
            {[64, 96, 128, 160, 192, 256, 320].map((b) => (
              <option key={b} value={b}>{b} kbps</option>
            ))}
          </select>
        </div>
        <input 
          type="file" 
          accept=".wav" 
          multiple 
          onChange={handleFiles} 
          className="file-input" 
        />
      </div>

      {/* 转换进度区域 */}
      {convertingFiles.length > 0 && (
        <section className="progress-section">
          <h2>转换进度</h2>
          <div className="progress-list">
            {convertingFiles.map(filename => {
              const progress = conversionProgress[filename];
              return (
                <div key={filename} className="progress-item">
                  <div className="progress-filename">{filename}</div>
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                    <div className="progress-text">
                      {progress.progress}% ({Math.round(progress.current / 1024)}k / {Math.round(progress.total / 1024)}k)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="output-section">
        <h2>输出文件</h2>
        <div className="output-grid">
          {outputs.map((o) => (
            <div key={o.url} className="output-card">
              <div className="filename">{o.name}</div>
              <audio controls src={o.url}></audio>
              <a href={o.url} download={o.name} className="download-btn">下载</a>
            </div>
          ))}
        </div>
      </section>

      <section className="log-section">
        <h2>日志输出</h2>
        <div className="log-box">
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </section>
    </div>
  );
}