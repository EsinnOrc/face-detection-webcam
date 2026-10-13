import React, { useEffect, useRef, useState, ReactNode } from 'react';

// Her duygu için YouTube linkleri
const EMOTION_YOUTUBE_MAP: Record<string, string> = {
  happy: 'https://www.youtube.com/embed/V5KuMnL6plo?list=PLuy3eFfdRdjfI5dW5aMTxNdofUWyHtFuy&autoplay=1',
  sad: 'https://www.youtube.com/embed/8aMzz1I8dsw?list=PLiF7nO4rHMbO0NeNYHxIGTqwB4zWJEfLN&index=2&autoplay=1',
  neutral: 'https://www.youtube.com/embed/3HP62w0lPbQ?autoplay=1',
  surprised: 'https://www.youtube.com/embed/YuBeBjqKSGQ?autoplay=1',
};

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.log("Error caught in ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [emotion, setEmotion] = useState('');
  const [isMusicEnabled, setIsMusicEnabled] = useState(false);
  const [currentTrackEmotion, setCurrentTrackEmotion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const faceapiRef = useRef<any>(null);
  const playerRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    let animationFrameId: number | null = null;

    const startDetection = async () => {
      if (!videoRef.current || !canvasRef.current || !faceapiRef.current) {
        return;
      }

      const faceapi = faceapiRef.current;

      // Create canvas only once
      if (!canvasElementRef.current) {
        const canvas = faceapi.createCanvasFromMedia(videoRef.current);
        canvasRef.current.appendChild(canvas);
        canvasElementRef.current = canvas;
      }

      const canvas = canvasElementRef.current;
      const displaySize = { 
        width: videoRef.current.videoWidth, 
        height: videoRef.current.videoHeight 
      };
      faceapi.matchDimensions(canvas, displaySize);

      const processVideo = async () => {
        if (!videoRef.current || !canvas || !faceapi || !isMounted) {
          return;
        }

        try {
          const detections = await faceapi.detectAllFaces(
            videoRef.current, 
            new faceapi.TinyFaceDetectorOptions()
          )
            .withFaceLandmarks()
            .withFaceExpressions();

          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            faceapi.draw.drawDetections(canvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
            faceapi.draw.drawFaceExpressions(canvas, resizedDetections);
          }

          if (detections.length > 0) {
            const expression = detections[0].expressions;
            const maxValue = Math.max(...Object.values(expression));
            const emotion = Object.keys(expression).filter((item) => {
              return (expression[item as keyof typeof expression] === maxValue);
            }).join(', ');
            setEmotion(emotion);
          }

          if (isMounted) {
            animationFrameId = requestAnimationFrame(processVideo);
          }
        } catch (error) {
          console.error("Error in processVideo:", error);
        }
      };

      processVideo();
    };

    const initialize = async () => {
      try {
        // Dynamic import for face-api.js (client-side only)
        const faceapi = await import('face-api.js');
        faceapiRef.current = faceapi;

        if (!isMounted) return;

        const loadModels = async () => {
          try {
            const MODEL_URL = `${window.location.origin}/models`;
            console.log("Loading models...");
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
            await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
            await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
            console.log("Models loaded.");
            return true;
          } catch (error) {
            console.error("Error loading models:", error);
            return false;
          }
        };

        const setupCamera = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });

            if (videoRef.current && isMounted) {
              videoRef.current.srcObject = stream;
              await new Promise<void>((resolve) => {
                if (videoRef.current) {
                  videoRef.current.onloadedmetadata = () => {
                    resolve();
                  };
                }
              });
              if (videoRef.current && isMounted) {
                videoRef.current.play();
                console.log("Camera setup complete.");
              }
            }
          } catch (error) {
            console.error("Error setting up camera:", error);
          }
        };

        const modelsLoaded = await loadModels();
        if (modelsLoaded && isMounted) {
          await setupCamera();
          if (videoRef.current && isMounted) {
            videoRef.current.addEventListener('loadeddata', startDetection);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("Error initializing:", error);
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      isMounted = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadeddata', startDetection);
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isMusicEnabled || !emotion || !playerRef.current) return;

    // face-api.js bazen birden fazla duygu döndürebiliyor, ilkini alıyoruz
    const baseEmotion = emotion.split(',')[0].trim().toLowerCase();

    const url = EMOTION_YOUTUBE_MAP[baseEmotion];
    if (!url) return;

    // Aynı duygu için tekrar tekrar değiştirme
    if (currentTrackEmotion === baseEmotion) return;

    playerRef.current.src = url;
    setCurrentTrackEmotion(baseEmotion);
  }, [emotion, isMusicEnabled, currentTrackEmotion]);

  return (
    <ErrorBoundary>
      <div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
          {isLoading && (
            <div style={{ marginBottom: '20px' }}>
              <p>Modeller yükleniyor ve kamera başlatılıyor...</p>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', marginRight: '20px' }}>
              <video ref={videoRef} width="640" height="480" autoPlay muted style={{ display: 'block' }} />
              <div ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
            </div>
            <div>
              <h1>Gerçek Zamanlı Duygu Tanıma</h1>
              <h2>Tespit Edilen Duygu: {emotion || 'Yükleniyor...'}</h2>
              <button
                style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isMusicEnabled ? '#ef4444' : '#22c55e',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
                onClick={() => {
                  setIsMusicEnabled((prev) => !prev);
                }}
              >
                {isMusicEnabled ? 'Müziği Durdur' : 'Duyguma Göre Müzik Çal'}
              </button>
              <p style={{ marginTop: '8px', fontSize: '0.9rem', maxWidth: '320px' }}>
                Otomatik çalma tarayıcı tarafından engellenebileceği için önce butona tıklaman gerekebilir.
              </p>
              {/* Müzik arka planda çalsın diye iframe'i gizliyoruz */}
              <div
                style={{
                  width: 0,
                  height: 0,
                  overflow: 'hidden',
                  position: 'absolute',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                <iframe
                  ref={playerRef}
                  width="0"
                  height="0"
                  style={{ border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Duyguya göre müzik"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
