import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [currentList, setCurrentList] = useState(null)
  const [newItem, setNewItem] = useState('')
  const [newQuantity, setNewQuantity] = useState(1)
  const [lists, setLists] = useState([])
  const [newListName, setNewListName] = useState('')
  const [joinListId, setJoinListId] = useState('')
  const [view, setView] = useState('all-lists')
  const [syncing, setSyncing] = useState(false)

  const API_URL = 'http://localhost:3000'

  // Load lists on mount
  useEffect(() => {
    loadAllLists()
  }, [])

  // Load all available lists
  const loadAllLists = async () => {
    try {
      const response = await fetch(`${API_URL}/lists`)
      const data = await response.json()
      const loadedLists = data.lists || []
      setLists(loadedLists)
    } catch (error) {
      console.error('Error loading lists:', error)
    }
  }

  const fetchList = async (listId) => {
    try {
      const response = await fetch(`${API_URL}/lists/${listId}`)
      if (response.ok) {
        const data = await response.json()
        return data.list // Extract the list from the response
      }
      return null
    } catch (error) {
      console.error('Error fetching list:', error)
      return null
    }
  }

  const loadList = async (listId) => {
    try {
      const list = await fetchList(listId)
      console.log('Loaded list:', list)
      setCurrentList(list)
      setView('list-detail')
    } catch (error) {
      console.error('Error loading list:', error)
    }
  }

  const createList = async () => {
    if (!newListName.trim()) return

    try {
      const listId = newListName.toLowerCase().replace(/\s+/g, '-')
      const response = await fetch(`${API_URL}/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId, name: newListName })
      })
      
      if (response.ok) {
        await loadAllLists()
        setNewListName('')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create list')
      }
      
    } catch (error) {
      console.error('Error creating list:', error)
    }
  }

  const joinList = async () => {
    if (!joinListId.trim()) return

    try {
      const list = await fetchList(joinListId)
      if (list) {
        setLists(prev => {
          const exists = prev.some(l => l.listId === list.listId)
          if (!exists) {
            return [...prev, list]
          }
          return prev
        })
        setJoinListId('')
      } else {
        console.error('List not found')
      }
    } catch (error) {
      console.error('Error joining list:', error)
    }
  }

  const deleteList = async (listId, listName) => {
    if (!window.confirm(`Are you sure you want to delete "${listName}"?`)) return

    try {
      // Remove from UI (no backend delete endpoint yet)
      setLists(prev => prev.filter(list => list.listId !== listId))
      if (currentList?.listId === listId) {
        setCurrentList(null)
        setView('all-lists')
      }
    } catch (error) {
      console.error('Error deleting list:', error)
    }
  }

  const shareList = (listId, listName) => {
    // Share the listId so others can join
    navigator.clipboard.writeText(listId)
    console.log(`List ID copied: ${listId}`)
  }

  const syncWithServer = async () => {
    setSyncing(true)
    try {
      const response = await fetch(`${API_URL}/sync`, {
        method: 'POST'
      })
      
      if (response.ok) {
        // Reload lists to show updated data with globalIds
        await loadAllLists()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Sync failed')
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(false)
    }
  }

  const addItem = async () => {
    if (!newItem.trim() || !currentList) return

    try {
      const quantity = parseInt(newQuantity) || 1
      
      // Update local state optimistically
      setCurrentList(prev => ({
        ...prev,
        items: [...prev.items, { item: newItem, inc: quantity, dec: 0 }]
      }))
      setNewItem('')
      setNewQuantity(1)

      const response = await fetch(`${API_URL}/lists/${currentList.listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName: newItem, quantity })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add item')
      }
    } catch (error) {
      console.error('Error adding item:', error)
    }
  }

  const increaseNeeded = async (itemName) => {
    try {
      // Update local state optimistically
      setCurrentList(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.item === itemName
            ? { ...item, inc: item.inc + 1 }
            : item
        )
      }))

      const response = await fetch(`${API_URL}/lists/${currentList.listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName, quantity: 1 })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to increase quantity')
      }
    } catch (error) {
      console.error('Error increasing quantity:', error)
    }
  }

  const increaseBought = async (itemName) => {
    try {
      // Update local state optimistically
      setCurrentList(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.item === itemName
            ? { ...item, dec: item.dec + 1 }
            : item
        )
      }))

      const response = await fetch(`${API_URL}/lists/${currentList.listId}/bought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to mark as bought')
      }
    } catch (error) {
      console.error('Error marking as bought:', error)
    }
  }

  const removeItem = async (itemName) => {
    try {
      // Update local state optimistically
      setCurrentList(prev => ({
        ...prev,
        items: prev.items.filter(item => item.item !== itemName)
      }))

      const response = await fetch(`${API_URL}/lists/${currentList.listId}/items/${itemName}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove item')
      }
    } catch (error) {
      console.error('Error removing item:', error)
    }
  }

  const backToAllLists = () => {
    setCurrentList(null)
    setView('all-lists')
    loadAllLists()
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">🛒 Listify</h1>
        <p className="text-gray-600">Collaborative shopping lists made easy</p>
      </header>

      {/* All Lists View */}
      {view === 'all-lists' && (
        <div className="space-y-6">
          {/* Create List Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Create New List</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Enter list name..."
                className="flex-1 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && createList()}
              />
              <button 
                onClick={createList}
                disabled={!newListName.trim()}
                className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Create List
              </button>
            </div>
          </div>

          {/* Join List Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Join Existing List</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={joinListId}
                onChange={(e) => setJoinListId(e.target.value)}
                placeholder="Enter list ID to join..."
                className="flex-1 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && joinList()}
              />
              <button 
                onClick={joinList}
                disabled={!joinListId.trim()}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Join List
              </button>
            </div>
          </div>

          {/* My Lists Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">My Lists</h2>
              <div className="flex items-center gap-3">
                <span className="text-gray-600">{lists.length} lists</span>
                <button
                  onClick={syncWithServer}
                  disabled={syncing}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center gap-2"
                >
                  <span className={syncing ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncing ? 'Syncing...' : 'Sync'}</span>
                </button>
              </div>
            </div>

            {lists.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lists.map((list) => (
                  <div key={list.listId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-lg font-semibold text-gray-800">{list.name}</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => shareList(list.listId, list.name)}
                          className="text-blue-500 hover:text-blue-700 p-1"
                          title="Share list"
                        >
                          Share
                        </button>
                        <button
                          onClick={() => deleteList(list.listId, list.name)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete list"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-3">
                      <div>ID: <code className="bg-gray-100 px-1 rounded">{list.listId}</code></div>
                      <div>{list.items?.length || 0} items</div>
                    </div>
                    
                    <button
                      onClick={() => loadList(list.listId)}
                      className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition-colors"
                    >
                      Open List
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">📝</div>
                <p className="text-gray-600 text-lg">No lists yet. Create your first list above!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List Detail View */}
      {view === 'list-detail' && currentList && (
        <div className="bg-white rounded-lg shadow p-6">
          {/* List Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <button
                onClick={backToAllLists}
                className="text-blue-500 hover:text-blue-700 mb-2 flex items-center gap-2"
              >
                ← Back to All Lists
              </button>
              <h2 className="text-3xl font-bold text-gray-800">{currentList.name}</h2>
              <p className="text-gray-600">List ID: <code className="bg-gray-100 px-2 py-1 rounded">{currentList.listId}</code></p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => shareList(currentList.listId, currentList.name)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center gap-2"
              >
                Share
              </button>
              <button
                onClick={() => deleteList(currentList.listId, currentList.name)}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Add Item Form */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Add New Item</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Item name..."
                className="md:col-span-2 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && addItem()}
              />
              <input
                type="number"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                min="1"
                placeholder="Quantity"
                className="border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={addItem}
                disabled={!newItem.trim()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Add Item
              </button>
            </div>
          </div>

          {/* Items List */}
          <div>
            <h3 className="text-xl font-semibold mb-4">
              Items ({currentList.items?.length || 0})
            </h3>
            
            {currentList.items && currentList.items.length > 0 ? (
              <div className="space-y-3">
                {currentList.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-semibold text-lg text-gray-800 mb-1">{item.item}</div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Need: {Math.max(0, item.inc - item.dec)}</span> • 
                        <span className="font-medium text-green-600"> Bought: {item.dec}</span> • 
                        <span className="font-medium text-blue-600"> Total: {item.inc}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => increaseNeeded(item.item)}
                        className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 flex items-center gap-1"
                        title="Add one more needed"
                      >
                        <span>+</span>
                        <span>Need</span>
                      </button>
                      
                      <button
                        onClick={() => increaseBought(item.item)}
                        className="bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 flex items-center gap-1"
                        title="Mark one as bought"
                      >
                        <span>+</span>
                        <span>Bought</span>
                      </button>
                      
                      <button
                        onClick={() => removeItem(item.item)}
                        className="bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600"
                        title="Remove item"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🛒</div>
                <p className="text-gray-600 text-lg">No items in this list yet. Add some items above!</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default App