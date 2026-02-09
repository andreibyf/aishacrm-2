"""
Quick test script for the reranker service
Run after starting start-reranker.bat
"""
import requests
import json

RERANKER_URL = "http://localhost:5001"

def test_health():
    """Test health endpoint"""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{RERANKER_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")

def test_rerank():
    """Test reranking with sample code snippets"""
    print("🔍 Testing reranker with sample code...")
    
    query = "React authentication flow"
    documents = [
        "const LoginForm = () => { const [email, setEmail] = useState(''); return <form>...</form>; }",
        "export async function authenticate(credentials) { const user = await verifyUser(credentials); return createSession(user); }",
        "const Dashboard = () => { return <div>Welcome to dashboard</div>; }",
        "function hashPassword(password) { return bcrypt.hash(password, 10); }",
        "const useAuth = () => { const [user, setUser] = useState(null); return { user, login, logout }; }",
    ]
    
    payload = {
        "query": query,
        "documents": documents,
        "top_k": 3
    }
    
    response = requests.post(f"{RERANKER_URL}/rerank", json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n📊 Top {len(result['ranked_documents'])} Results:\n")
        for i, doc in enumerate(result['ranked_documents'], 1):
            print(f"Rank {i} (Score: {doc['score']:.3f})")
            print(f"  {doc['text'][:80]}...")
            print()
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    print("=" * 60)
    print("Continue.dev Reranker Service Test")
    print("=" * 60 + "\n")
    
    try:
        test_health()
        test_rerank()
        print("✅ All tests passed!")
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to reranker service")
        print("Make sure to run: .continue\\reranker\\start-reranker.bat")
    except Exception as e:
        print(f"❌ Error: {e}")
