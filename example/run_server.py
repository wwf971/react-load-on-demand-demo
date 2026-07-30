from flask import Flask, send_from_directory, jsonify, send_file
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Centralized component metadata configuration
COMPONENTS_METADATA = {
    "components": {
        "lazy": {
            "compName": "lazyApp",
            "compUrl": "http://localhost:5000/get-comp-file/lazy/assets/LazyComp.js",
            "modulePath": "./@lazy/component",
            "dist_dir": os.path.join(os.path.dirname(__file__), 'lazy', 'dist')
        },
        "lazy-2": {
            "compName": "lazy2App",
            "compUrl": "http://localhost:5000/get-comp-file/lazy-2/assets/SpecialFeature.js",
            "modulePath": "./@lazy2/feature",
            "dist_dir": os.path.join(os.path.dirname(__file__), 'lazy-2', 'dist')
        }
    }
}

# Paths
MAIN_DIR = os.path.join(os.path.dirname(__file__), 'main', 'dist')

# API endpoint - returns metadata about a specific component
@app.route('/get-comp-metadata/<comp_name>')
def get_comp_metadata(comp_name):
    """
    Returns federation metadata for the requested component.
    The server is in full control of what gets loaded.
    """
    comp_info = COMPONENTS_METADATA["components"].get(comp_name)
    if not comp_info:
        return jsonify({"error": "Component not found"}), 404
    
    return jsonify({
        "compName": comp_info["compName"],
        "compUrl": comp_info["compUrl"],
        "modulePath": comp_info["modulePath"]
    })

# Serve component files
@app.route('/get-comp-file/<comp_name>/<path:filename>')
def serve_comp_file(comp_name, filename):
    """Serve files from the specified component's dist folder"""
    comp_info = COMPONENTS_METADATA["components"].get(comp_name)
    if not comp_info:
        return "Component not found", 404
    
    return send_from_directory(comp_info["dist_dir"], filename)

# Serve main app assets
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve assets from the main app"""
    assets_dir = os.path.join(MAIN_DIR, 'assets')
    return send_from_directory(assets_dir, filename)

# Serve main index.html for all other routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_main(path):
    """Serve the main app"""
    if path and os.path.exists(os.path.join(MAIN_DIR, path)):
        return send_from_directory(MAIN_DIR, path)
    return send_file(os.path.join(MAIN_DIR, 'index.html'))

if __name__ == '__main__':
    print("🚀 Server starting...")
    print(f"📁 Main app: {MAIN_DIR}")
    print("📁 Available components:")
    for name, config in COMPONENTS_METADATA["components"].items():
        print(f"   - {name}: {config['modulePath']}")
    print("🌐 Open http://localhost:5000 in your browser")
    print("=" * 50)
    app.run(debug=True, port=5000, host='0.0.0.0')
