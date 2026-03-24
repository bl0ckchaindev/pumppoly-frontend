'use client'
import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'react-hot-toast'
import { imageUrl, apiUrl, imageUploadUrl } from '../../lib/constants.ts'
import Link from 'next/link'
import { 
  supabase, 
  subscribeToChat, 
  fetchChatMessages,
  postChatMessage,
  fetchProfile
} from '../../lib/supabase.ts'
import apiService from '../../lib/api.ts'
import { useChain } from '../../lib/context/ChainContext'
import UnifiedWalletButton from '../wallet/UnifiedWalletButton'
import './CommentChat.css'
import { useSupabase } from '../../lib/constants'

const CommentChat = ({ tokenAddress, showInput = true, simplified = false }) => {
  const { walletAddress, isWalletConnected, activeChain } = useChain()
  const { signMessageAsync, isPending: isSigning } = useSignMessage()
  const { wallet: solanaWallet } = useWallet()
  const address = walletAddress
  const isConnected = isWalletConnected
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [commentImage, setCommentImage] = useState(null)
  const [commentImageUrl, setCommentImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [usernames, setUsernames] = useState({})
  const [visibleItems, setVisibleItems] = useState(10)
  const chatEndRef = useRef(null)
  const commentsContainerRef = useRef(null)
  const imageInputRef = useRef(null)
  const subscriptionRef = useRef(null)
  const mountedRef = useRef(true)
  const prevCommentsLengthRef = useRef(0)
  const profileSubscriptionsRef = useRef({})
  const formatCommentRef = useRef(formatComment)
  const fetchUsernameRef = useRef(fetchUsername)
  const usernamesRef = useRef(usernames)
  formatCommentRef.current = formatComment
  fetchUsernameRef.current = fetchUsername
  usernamesRef.current = usernames

  // Fetch username for a sender address
  const fetchUsername = useCallback(async (senderAddress) => {
    if (!useSupabase || !senderAddress) return
    
    try {
      const profileData = await fetchProfile(senderAddress)
      if (profileData && profileData.length > 0) {
        const profile = profileData[0]
        const username = profile.username || profile.name
        if (username) {
          setUsernames(prev => ({ ...prev, [senderAddress.toLowerCase()]: username }))
        }
      }
    } catch (error) {
      console.error('Error fetching username for', senderAddress, error)
    }
  }, [])

  // Format comment data consistently
  const formatComment = useCallback((item) => {
    let sender = item.sender
    let content = item.content
    let currentDate = Date.now()
    // Timestamp is stored in milliseconds, calculate difference in seconds
    let dateInSeconds = (currentDate - Number(item.timestamp)) / 1000
    
    let dateStr = 'just now'
    if (dateInSeconds > 86400) {
      dateStr = Math.floor(dateInSeconds / 86400) + ' days ago'
    } else if (dateInSeconds > 3600) {
      dateStr = Math.floor(dateInSeconds / 3600) + ' hours ago'
    } else if (dateInSeconds > 60) {
      dateStr = Math.floor(dateInSeconds / 60) + ' mins ago'
    } else if (dateInSeconds > 0) {
      dateStr = Math.floor(dateInSeconds) + ' secs ago'
    }
    
    // EVM: lowercase for profile path; Solana: as-is (base58)
    const avatarSender = (sender || '').startsWith('0x') ? (sender || '').toLowerCase() : (sender || '')
    const avatarUrl = `${imageUploadUrl}profile/${avatarSender || 'unknown'}.png`
    
    return {
      Sender: sender,
      Content: content,
      Date: dateStr,
      ImageUrl: item.image_url || item.imageUrl || '',
      avatar: avatarUrl,
      timestamp: item.timestamp,
      username: usernames[sender.toLowerCase()] || null
    }
  }, [usernames])

  // Merge server comments with current state: keep local messages; preserve existing username so it never flips to blank
  const mergeComments = useCallback((prevComments, serverFormatted) => {
    if (!serverFormatted || serverFormatted.length === 0) return prevComments
    const merged = serverFormatted.map((s) => {
      const senderNorm = (s.Sender ?? '').toLowerCase()
      const prevMatch = prevComments.find(
        (p) =>
          Math.abs(Number(p.timestamp) - Number(s.timestamp)) < 15000 &&
          (p.Sender ?? '').toLowerCase() === senderNorm &&
          (p.Content ?? '') === (s.Content ?? '')
      )
      if (prevMatch?.username && !s.username) return { ...s, username: prevMatch.username }
      return s
    })
    for (const c of prevComments) {
      const ts = Number(c.timestamp)
      const senderNorm = (c.Sender ?? '').toLowerCase()
      const contentNorm = c.Content ?? ''
      const inServer = merged.some(
        (s) =>
          Math.abs(Number(s.timestamp) - ts) < 15000 &&
          (s.Sender ?? '').toLowerCase() === senderNorm &&
          (s.Content ?? '') === contentNorm
      )
      if (!inServer) merged.push(c)
    }
    merged.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    return merged
  }, [])

  // Fetch comments from Supabase; merge with existing state so optimistic/sent messages are never lost
  const fetchComments = useCallback(async (mergeWithExisting = false) => {
    if (!useSupabase || !tokenAddress) {
      setLoading(false)
      return
    }

    try {
      const messages = await fetchChatMessages(tokenAddress)
      const data = messages.map(msg => ({
        sender: msg.sender ?? msg.Sender,
        content: msg.content ?? msg.Content,
        timestamp: msg.timestamp ?? msg.Timestamp,
        imageUrl: msg.image_url ?? msg.imageUrl
      }))

      const formatter = formatCommentRef.current || formatComment
      const formattedComments = data.map(item => formatter(item))
      if (mergeWithExisting) {
        setComments(prev => mergeComments(prev, formattedComments))
      } else {
        setComments(formattedComments)
      }

      const uniqueSenders = [...new Set(data.map(msg => msg.sender.toLowerCase()))]
      const currentUsernames = usernamesRef.current || {}
      uniqueSenders.forEach(sender => {
        if (!currentUsernames[sender]) {
          const senderAddress = data.find(msg => msg.sender.toLowerCase() === sender)?.sender
          if (senderAddress) {
            fetchUsername(senderAddress)
          }
        }
      })
    } catch (error) {
      console.error('Error fetching comments:', error)
      if (!mergeWithExisting) setComments([])
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, formatComment, mergeComments])

  // Refresh avatars only when new comments arrive (not on a timer to avoid excessive requests)
  // Removed automatic refresh interval to prevent 429 errors

  // Set up real-time subscription for Supabase; resubscribe when channel closes unexpectedly (e.g. connection drop)
  const setupChatSubscription = useCallback(() => {
    if (!tokenAddress || !useSupabase) return

    const onMessage = (newMessage) => {
      const formatter = formatCommentRef.current
      const fetchUser = fetchUsernameRef.current
      const currentUsernames = usernamesRef.current
      if (!formatter) return

      const sender = newMessage?.sender ?? newMessage?.Sender ?? ''
      const senderLower = (sender || '').toLowerCase()
      if (senderLower && !currentUsernames[senderLower]) {
        fetchUser(sender)
      }

      const formattedMessage = formatter({
        sender,
        content: newMessage?.content ?? newMessage?.Content ?? '',
        timestamp: newMessage?.timestamp ?? newMessage?.Timestamp ?? 0,
        imageUrl: newMessage?.image_url ?? newMessage?.imageUrl ?? ''
      })

      const ts = Number(newMessage?.timestamp ?? newMessage?.Timestamp ?? 0)
      const senderNorm = (formattedMessage?.Sender ?? '').toLowerCase()
      const contentNorm = formattedMessage?.Content ?? ''
      setComments(prev => {
        const exists = prev.some(
          (c) =>
            (c.Sender ?? '').toLowerCase() === senderNorm &&
            (c.Content ?? '') === contentNorm &&
            Math.abs(Number(c.timestamp) - ts) < 15000
        )
        if (exists) return prev
        return [formattedMessage, ...prev]
      })
    }

    const onStatusChange = (status, err) => {
      if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        subscriptionRef.current = null
        if (!mountedRef.current) return
        setTimeout(() => {
          if (!mountedRef.current || subscriptionRef.current !== null) return
          setupChatSubscription()
        }, 100)
      }
    }

    subscriptionRef.current = subscribeToChat(tokenAddress, onMessage, onStatusChange)
  }, [tokenAddress])

  useEffect(() => {
    if (!tokenAddress || !useSupabase) {
      setLoading(false)
      return
    }

    mountedRef.current = true
    fetchComments(false)

    setupChatSubscription()

    const pollInterval = setInterval(() => {
      if (!mountedRef.current || !tokenAddress || !useSupabase) return
      fetchComments(true)
    }, 4000)

    return () => {
      mountedRef.current = false
      clearInterval(pollInterval)
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
    // Intentionally only tokenAddress: keep one stable realtime subscription; refs provide latest formatComment/fetchUsername
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchComments run on mount/token change only
  }, [tokenAddress, setupChatSubscription])

  // Check authentication status on mount and when wallet changes (EVM or Solana)
  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthenticated(false)
      return
    }
    const authKey = `comment_auth_${address.startsWith('0x') ? address.toLowerCase() : address}`
    const authStatus = sessionStorage.getItem(authKey)
    setIsAuthenticated(authStatus === 'authenticated')
  }, [isConnected, address])

  // Newest first: show first N messages (newest at top); "load more" when scrolled near bottom
  const visibleComments = comments.slice(0, visibleItems)
  const hasMore = visibleItems < comments.length

  // Handle scroll: load more when user scrolls near bottom
  useEffect(() => {
    const handleScroll = () => {
      if (!commentsContainerRef.current) return
      const container = commentsContainerRef.current
      const scrollTop = container.scrollTop
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore) {
        setVisibleItems(prev => Math.min(prev + 10, comments.length))
      }
    }
    const container = commentsContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, comments.length])

  const scrollToTop = () => {
    if (commentsContainerRef.current) {
      commentsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Scroll to top when new message is inserted (newest at top) or on initial load
  useEffect(() => {
    const container = commentsContainerRef.current
    if (!container) return
    const prevLen = prevCommentsLengthRef.current
    prevCommentsLengthRef.current = comments.length
    if (loading || comments.length > prevLen || prevLen === 0) {
      requestAnimationFrame(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = 0
        }
      })
    }
  }, [comments.length, loading])

  // Update comments when usernames load: patch comments that lack username (use formatComment from closure so we have latest usernames)
  useEffect(() => {
    if (comments.length === 0 || Object.keys(usernames).length === 0) return
    setComments(prev => {
      let hasChanges = false
      const updated = prev.map(comment => {
        const senderLower = comment.Sender?.toLowerCase()
        if (senderLower && usernames[senderLower] && !comment.username) {
          hasChanges = true
          return formatComment({
            sender: comment.Sender,
            content: comment.Content,
            timestamp: comment.timestamp,
            imageUrl: comment.ImageUrl
          })
        }
        return comment
      })
      return hasChanges ? updated : prev
    })
  }, [usernames, formatComment, comments.length])

  const handleSignMessage = async () => {
    if (!address || !isConnected) {
      toast.error('Please connect your wallet first')
      return
    }

    const message = `Sign this message to authenticate and post comments.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`

    try {
      if (activeChain === 'solana') {
        if (!solanaWallet?.adapter?.signMessage) {
          toast.error('Your wallet does not support message signing')
          return
        }
        const encoded = new TextEncoder().encode(message)
        await solanaWallet.adapter.signMessage(encoded)
        const authKey = `comment_auth_${address}`
        sessionStorage.setItem(authKey, 'authenticated')
        setIsAuthenticated(true)
        toast.success('Authentication successful! You can now post comments.')
        return
      }

      const signature = await signMessageAsync({ message })
      if (signature) {
        const authKey = `comment_auth_${address.toLowerCase()}`
        sessionStorage.setItem(authKey, 'authenticated')
        setIsAuthenticated(true)
        toast.success('Authentication successful! You can now post comments.')
      }
    } catch (error) {
      console.error('Error signing message:', error)
      if (error?.message?.includes('User rejected') || error?.message?.includes('rejected')) {
        toast.error('Message signing cancelled')
      } else {
        toast.error('Failed to sign message. Please try again.')
      }
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB')
        return
      }
      setCommentImage(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const removeImage = () => {
    setCommentImage(null)
    setCommentImageUrl('')
    setImagePreview('')
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  const uploadImageToBackend = async (file) => {
    try {
      // Upload to backend API
      const response = await apiService.uploadCommentImage(file)
      
      if (response.imageUrl) {
        // Return full URL
        return `${apiUrl}${response.imageUrl}`
      } else if (response.fileInfo?.filename) {
        // Fallback: construct URL from filename
        return `${apiUrl}/uploads/comments/${response.fileInfo.filename}`
      } else {
        throw new Error('Invalid response from upload server')
      }
    } catch (error) {
      console.error('Error uploading image to backend:', error)
      throw error
    }
  }

  const handleSendComment = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet to comment')
      return
    }

    if (!isAuthenticated) {
      toast.error('Please sign the authentication message to post comments')
      return
    }

    if (!useSupabase) {
      toast.error('Comments are only available with Supabase')
      return
    }

    if (!newComment.trim() && !commentImage) {
      toast.error('Please enter a comment or upload an image')
      return
    }

    if (!walletAddress) {
      toast.error('Wallet address not available')
      return
    }

    setSending(true)
    let imageUrlToSave = ''

    try {
      if (commentImage) {
        setUploadingImage(true)
        try {
          imageUrlToSave = await uploadImageToBackend(commentImage)
        } catch (error) {
          console.error('Error uploading image:', error)
          toast.error(error?.message || 'Failed to upload image')
          setUploadingImage(false)
          setSending(false)
          return
        } finally {
          setUploadingImage(false)
        }
      }

      const contentToSend = newComment.trim() || ' '
      const optimisticTs = Date.now()
      const optimisticFormatted = formatComment({
        sender: walletAddress,
        content: contentToSend,
        timestamp: optimisticTs,
        image_url: imageUrlToSave
      })

      setComments(prev => [optimisticFormatted, ...prev])
      setVisibleItems(prev => Math.max(prev, 1))
      setNewComment('')
      setCommentImage(null)
      setCommentImageUrl('')
      setImagePreview('')
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }

      const inserted = await postChatMessage(
        tokenAddress,
        walletAddress,
        contentToSend,
        imageUrlToSave
      )

      const serverFormatted = formatComment({
        sender: inserted?.sender ?? inserted?.Sender ?? walletAddress,
        content: (inserted?.content ?? inserted?.Content ?? contentToSend) || ' ',
        timestamp: inserted?.timestamp ?? inserted?.Timestamp ?? optimisticTs,
        image_url: inserted?.image_url ?? inserted?.imageUrl ?? imageUrlToSave
      })
      setComments(prev => {
        const filtered = prev.filter(
          (c) =>
            !(
              (c.Sender ?? '').toLowerCase() === (walletAddress || '').toLowerCase() &&
              (c.Content ?? '') === contentToSend &&
              Math.abs(Number(c.timestamp) - optimisticTs) < 15000
            )
        )
        return [serverFormatted, ...filtered]
      })
      toast.success('Comment posted!')
      fetchComments(true).catch(() => {})
    } catch (error) {
      console.error('Error sending comment:', error)
      toast.error(error?.message || 'Failed to post comment')
      setComments(prev =>
        prev.filter(
          (c) =>
            !(
              (c.Sender ?? '').toLowerCase() === (walletAddress || '').toLowerCase() &&
              (c.Content ?? '') === contentToSend &&
              Math.abs(Number(c.timestamp) - optimisticTs) < 30000
            )
        )
      )
    } finally {
      setSending(false)
    }
  }


  if (!useSupabase) {
    return (
      <div>
        <h2 style={{ color: '#fff', marginBottom: '20px' }}>Comments</h2>
        <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
          Comments require Supabase configuration
        </div>
      </div>
    )
  }

  // Simplified layout for home page
  if (simplified) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          fontSize: '14px', 
          color: '#999', 
          textTransform: 'uppercase', 
          fontWeight: '600'
        }}>
          COMMUNITY CHAT
        </div>
        <div style={{ 
          flex: 1, 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          marginTop: '12px'
        }}
        className="comment-chat-scroll"
        >
          {comments.length === 0 ? (
            <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
              No comments yet
            </div>
          ) : (
            comments.slice(0, 10).map((item, index) => (
              <div
                key={item.timestamp || index}
                style={{
                  background: '#1a1a1a',
                  borderRadius: '8px',
                  padding: '8px',
                  border: '1px solid #333',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}
              >
                <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '50%', border: '1px solid #333', flexShrink: 0, overflow: 'hidden', background: '#251939' }}>
                  <img
                    src={item.avatar}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                  {/* <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#9333ea', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} aria-hidden>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg> */}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                    <Link
                      href={`/profile?address=${item.Sender}`}
                      style={{ fontSize: '13px', fontWeight: '600', textDecoration: 'none', color: '#fff' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#18d78c'; e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.textDecoration = 'none' }}
                    >
                      {item.username ?? ''}
                    </Link>
                    <span style={{ color: '#999', fontSize: '12px', whiteSpace: 'nowrap' }}>{item.Date}</span>
                  </div>
                  <div style={{ color: '#ccc', fontSize: '13px', wordBreak: 'break-word' }}>{item.Content}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Comment Input */}
      {showInput && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        {/* Image Preview */}
        {imagePreview && (
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '4px' }}>
            <img 
              src={imagePreview} 
              alt="Preview"
              style={{
                maxWidth: '120px',
                maxHeight: '120px',
                borderRadius: '4px',
                border: '1px solid #333'
              }}
            />
            <button
              onClick={removeImage}
              style={{
                position: 'absolute',
                top: '3px',
                right: '3px',
                background: '#f00',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: '1'
              }}
            >
              ×
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={!isConnected || !isAuthenticated || sending || uploadingImage}
            style={{
              padding: '8px',
              height: '40px',
              width: '40px',
              background: '#222',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              cursor: (!isConnected || !isAuthenticated || sending || uploadingImage) ? 'not-allowed' : 'pointer',
              opacity: (!isConnected || !isAuthenticated || sending || uploadingImage) ? 0.5 : 1,
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Upload image"
          >
            📷
          </button>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && isConnected && isAuthenticated) {
                e.preventDefault()
                handleSendComment()
              }
            }}
            placeholder={
              !isConnected 
                ? "Connect wallet to comment" 
                : !isAuthenticated 
                ? "Sign message to comment" 
                : "Write a comment..."
            }
            disabled={!isConnected || !isAuthenticated || sending || uploadingImage}
            style={{
              flex: 1,
              padding: '8px 10px',
              minHeight: '40px',
              maxHeight: '120px',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: '1.4'
            }}
          />
          {!isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <UnifiedWalletButton />
            </div>
          ) : !isAuthenticated ? (
            <button
              onClick={handleSignMessage}
              disabled={isSigning}
              style={{
                padding: '6px 12px',
                height: '40px',
                background: isSigning ? '#333' : '#007bff',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: isSigning ? 'not-allowed' : 'pointer',
                opacity: isSigning ? 0.5 : 1,
                whiteSpace: 'nowrap'
              }}
            >
              {isSigning ? 'Signing...' : 'Sign'}
            </button>
          ) : (
            <button
              onClick={handleSendComment}
              disabled={sending || uploadingImage || (!newComment.trim() && !commentImage)}
              style={{
                padding: '6px',
                height: '40px',
                width: '40px',
                background: (sending || uploadingImage || (!newComment.trim() && !commentImage)) 
                  ? '#333' 
                  : '#9333EA',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: (sending || uploadingImage || (!newComment.trim() && !commentImage)) ? 'not-allowed' : 'pointer',
                opacity: (sending || uploadingImage || (!newComment.trim() && !commentImage)) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              title={uploadingImage ? 'Uploading...' : sending ? 'Sending...' : 'Send'}
            >
              {uploadingImage || sending ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      )}
      
      {/* Comments List */}
      <div 
        ref={commentsContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '600px',
          marginBottom: '12px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="comment-chat-scroll"
      >
        {loading ? (
          <div style={{ color: '#999', textAlign: 'center', padding: '12px', fontSize: '13px' }}>Loading comments...</div>
        ) : comments.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', padding: '12px', fontSize: '13px' }}>
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <>
            {visibleComments.map((comment, index) => (
              <div
                key={comment.timestamp || index}
                style={{
                  marginBottom: '2px',
                  padding: '10px 8px',
                  borderBottom: '1px solid #333',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}
              >
                <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #333', flexShrink: 0, overflow: 'hidden', background: '#251939' }}>
                  <img
                    src={comment.avatar}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#9333ea', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} aria-hidden>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <Link
                      href={`/profile?address=${comment.Sender}`}
                      style={{ color: '#9333EA', fontSize: '13px', fontWeight: '600', textDecoration: 'none', flexShrink: 0 }}
                    >
                      {comment.username ?? ''}
                    </Link>
                    <span style={{ color: '#999', fontSize: '11px', flexShrink: 0 }}>
                      {comment.Date}
                    </span>
                  </div>
                  <span style={{ color: '#fff', fontSize: '13px', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {comment.Content}
                  </span>
                  {comment.ImageUrl && (
                    <img
                      src={comment.ImageUrl}
                      alt="Comment attachment"
                      style={{
                        marginTop: '4px',
                        maxWidth: '100%',
                        maxHeight: '250px',
                        borderRadius: '6px',
                        border: '1px solid #333',
                        cursor: 'pointer',
                        alignSelf: 'flex-start'
                      }}
                      onClick={() => window.open(comment.ImageUrl, '_blank')}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '10px', color: '#999', fontSize: '12px' }}>
                Scroll down to load more...
              </div>
            )}
            <div ref={chatEndRef} />
          </>
        )}
      </div>
      
      {visibleItems >= 20 && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'sticky',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: '#9333ea',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            boxShadow: '0 4px 12px rgba(147, 51, 234, 0.4)',
            zIndex: 100
          }}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M18 15l-6-6-6 6"></path>
          </svg>
          Go to Top
        </button>
      )}
    </div>
  )
}

export default memo(CommentChat)
