react-lazy-load/
├── main/                          # Host application
│   ├── src/
│   │   ├── App.jsx               # Main UI with load button
│   │   ├── compLoader.js   # Core federation logic
│   │   └── App.css
│   └── dist/                     # Built bundle
├── lazy/                         # Remote component
│   ├── src/
│   │   ├── LazyComponent.jsx    # The lazy-loaded component
│   │   └── LazyComponent.css
│   ├── vite.config.js           # Federation configuration
│   └── dist/                    # Built federation bundle
├── run_server.py                # Flask server
├── requirements.txt
├── README.md
└── EXPERIMENT_SUMMARY.md        # Detailed analysis