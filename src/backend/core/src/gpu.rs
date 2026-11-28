//! GPU の計測。sysinfo の GPU 情報は（Windows では）スレッドをまたいで持てないので、
//! 専用のスレッドに持たせ、計測のたびに頼んで結果を受け取る。

use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use sysinfo::Gpus;

use crate::metrics::clamp_percent;
use crate::model::GpuStats;

const REPLY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug)]
pub struct GpuSampler {
    requests: Sender<Sender<Vec<GpuStats>>>,
}

impl GpuSampler {
    /// 計測用のスレッドを起こす。起こせなかったときは、いつも空の結果を返す。
    pub fn start() -> Self {
        let (requests, inbox) = mpsc::channel::<Sender<Vec<GpuStats>>>();
        let _ = std::thread::Builder::new()
            .name("gpu".to_owned())
            .spawn(move || {
                let mut gpus = Gpus::new_with_refreshed_list().ok();
                for reply in inbox {
                    let stats = gpus.as_mut().map_or_else(Vec::new, |g| {
                        g.refresh(true);
                        g.iter().map(gpu_stats).collect()
                    });
                    let _ = reply.send(stats);
                }
            });
        Self { requests }
    }

    pub fn sample(&self) -> Vec<GpuStats> {
        let (reply, answer) = mpsc::channel();
        if self.requests.send(reply).is_err() {
            return Vec::new();
        }
        answer.recv_timeout(REPLY_TIMEOUT).unwrap_or_default()
    }
}

fn gpu_stats(g: &sysinfo::Gpu) -> GpuStats {
    GpuStats {
        name: g.model().unwrap_or_default().trim().to_owned(),
        vendor: g.vendor().unwrap_or_default().trim().to_owned(),
        usage: g.usage().map(clamp_percent),
        memory_total: g.total_memory(),
        memory_used: g.used_memory(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod system {
        use super::*;

        /// 実機に GPU が無くても止まらず、取れた値は範囲に収まっている
        #[test]
        fn sampling_twice_returns_values_in_range() {
            let sampler = GpuSampler::start();
            sampler.sample();
            for g in sampler.sample() {
                assert!(g.usage.is_none_or(|u| (0.0..=100.0).contains(&u)));
                if let (Some(used), Some(total)) = (g.memory_used, g.memory_total) {
                    assert!(total > 0 || used == 0);
                }
            }
        }
    }
}
