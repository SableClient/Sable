use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        RwLock,
    },
    time::Duration,
};

use tokio::{
    sync::Notify,
    time::{timeout_at, Instant},
};

#[derive(Clone)]
pub(super) struct MediaSession {
    pub(super) origin: String,
    pub(super) token: String,
    // Cache key input. The Matrix user ID, not `token`, which rotates on every OIDC
    // refresh and would orphan the whole on-disk cache.
    pub(super) scope: String,
    pub(super) generation: u64,
}

pub(super) struct SessionStore {
    current: RwLock<Option<MediaSession>>,
    ready: Notify,
    ever_set: AtomicBool,
    generation: AtomicU64,
}

impl Default for SessionStore {
    fn default() -> Self {
        Self {
            current: RwLock::new(None),
            ready: Notify::new(),
            ever_set: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }
}

impl SessionStore {
    pub(super) fn current(&self) -> Option<MediaSession> {
        self.current.read().ok().and_then(|session| session.clone())
    }

    pub(super) async fn wait_initial(&self, wait: Duration) -> Option<MediaSession> {
        if let Some(session) = self.current() {
            return Some(session);
        }
        if self.ever_set.load(Ordering::Acquire) {
            return None;
        }

        let deadline = Instant::now() + wait;
        loop {
            let mut notified = std::pin::pin!(self.ready.notified());
            // Register before re-checking, otherwise a session arriving in between is missed.
            notified.as_mut().enable();
            if let Some(session) = self.current() {
                return Some(session);
            }
            if timeout_at(deadline, notified).await.is_err() {
                return None;
            }
        }
    }

    pub(super) async fn wait_newer(
        &self,
        previous: &MediaSession,
        wait: Duration,
    ) -> Option<MediaSession> {
        let deadline = Instant::now() + wait;
        loop {
            let mut notified = std::pin::pin!(self.ready.notified());
            // Register before re-checking, otherwise a session arriving in between is missed.
            notified.as_mut().enable();
            match self.current() {
                Some(session) if session.generation > previous.generation => {
                    if session.origin != previous.origin || session.scope != previous.scope {
                        return None;
                    }
                    if session.token != previous.token {
                        return Some(session);
                    }
                }
                None if self.generation.load(Ordering::Acquire) > previous.generation => {
                    return None;
                }
                _ => {}
            }
            if timeout_at(deadline, notified).await.is_err() {
                return None;
            }
        }
    }

    // `before_notify` runs before waiters wake, so none observes the new session with stale state.
    pub(super) fn set(
        &self,
        mut session: MediaSession,
        before_notify: impl FnOnce(bool),
    ) -> Result<(), String> {
        let mut current = self
            .current
            .write()
            .map_err(|_| "media session lock poisoned".to_owned())?;
        let changed = current.as_ref().is_none_or(|existing| {
            existing.origin != session.origin
                || existing.token != session.token
                || existing.scope != session.scope
        });
        session.generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        *current = Some(session);
        drop(current);
        before_notify(changed);
        self.ever_set.store(true, Ordering::Release);
        self.ready.notify_waiters();
        Ok(())
    }

    pub(super) fn clear(&self, before_notify: impl FnOnce()) -> Result<(), String> {
        let mut current = self
            .current
            .write()
            .map_err(|_| "media session lock poisoned".to_owned())?;
        *current = None;
        self.generation.fetch_add(1, Ordering::AcqRel);
        drop(current);
        before_notify();
        self.ready.notify_waiters();
        Ok(())
    }
}
