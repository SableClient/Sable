use std::sync::{Mutex, MutexGuard, PoisonError};

use tokio::sync::oneshot;

/// Hands a freed slot to the newest waiter. Media is requested for what is on screen, so
/// the latest request is the one being waited on; `Semaphore` is fair, which buries a
/// just-opened picker behind the avatar backlog of a member list that started first.
pub(super) struct LifoLane {
    inner: Mutex<LaneInner>,
}

struct LaneInner {
    available: usize,
    waiters: Vec<oneshot::Sender<()>>,
}

impl LifoLane {
    pub(super) fn new(permits: usize) -> Self {
        Self {
            inner: Mutex::new(LaneInner {
                available: permits,
                waiters: Vec::new(),
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, LaneInner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) async fn acquire(&self) -> LanePermit<'_> {
        let receiver = {
            let mut inner = self.lock();
            if inner.available > 0 {
                inner.available -= 1;
                return LanePermit { lane: self };
            }
            let (sender, receiver) = oneshot::channel();
            inner.waiters.push(sender);
            receiver
        };

        let _ = receiver.await;
        LanePermit { lane: self }
    }

    fn release(&self) {
        let mut inner = self.lock();
        while let Some(waiter) = inner.waiters.pop() {
            // A waiter that went away passes its slot to the next one down.
            if waiter.send(()).is_ok() {
                return;
            }
        }
        inner.available += 1;
    }
}

pub(super) struct LanePermit<'a> {
    lane: &'a LifoLane,
}

impl Drop for LanePermit<'_> {
    fn drop(&mut self) {
        self.lane.release();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::LifoLane;

    #[tokio::test]
    async fn lane_serves_the_newest_waiter_first() {
        let lane = Arc::new(LifoLane::new(1));
        let started = Arc::new(Mutex::new(Vec::new()));

        let held = lane.acquire().await;

        let mut queued = Vec::new();
        for id in 0..3 {
            let lane = lane.clone();
            let started = started.clone();
            queued.push(tokio::spawn(async move {
                let _permit = lane.acquire().await;
                started.lock().unwrap().push(id);
            }));
            // Queue in a known order.
            tokio::task::yield_now().await;
        }

        drop(held);
        for task in queued {
            task.await.unwrap();
        }

        assert_eq!(*started.lock().unwrap(), vec![2, 1, 0]);
    }
}
