#[cfg(not(windows))]
use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};

use crate::model::{Connection, Protocol, TcpState};

pub const MAX_CONNECTIONS: usize = 4000;

pub fn netstat_state(name: &str) -> Option<TcpState> {
    Some(match name {
        "LISTENING" | "LISTEN" => TcpState::Listen,
        "ESTABLISHED" => TcpState::Established,
        "SYN_SENT" => TcpState::SynSent,
        "SYN_RECEIVED" | "SYN_RECV" => TcpState::SynReceived,
        "FIN_WAIT_1" | "FIN_WAIT1" => TcpState::FinWait1,
        "FIN_WAIT_2" | "FIN_WAIT2" => TcpState::FinWait2,
        "TIME_WAIT" => TcpState::TimeWait,
        "CLOSE_WAIT" => TcpState::CloseWait,
        "LAST_ACK" => TcpState::LastAck,
        "CLOSING" => TcpState::Closing,
        "CLOSED" | "CLOSE" => TcpState::Closed,
        _ => return None,
    })
}

/// `アドレス:ポート`（IPv6 は `[アドレス]:ポート`、相手が無いときは `*:*`）を分ける。
pub fn split_endpoint(text: &str) -> Option<(String, u16)> {
    let (address, port) = text.rsplit_once(':')?;
    let address = address
        .strip_prefix('[')
        .and_then(|a| a.strip_suffix(']'))
        .unwrap_or(address);
    let port = if port == "*" { 0 } else { port.parse().ok()? };
    Some((address.to_owned(), port))
}

pub fn parse_netstat(output: &str) -> Vec<Connection> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let (protocol, state, pid) = match parts.as_slice() {
                ["TCP", _, _, state, pid] => (Protocol::Tcp, netstat_state(state), *pid),
                ["UDP", _, _, pid] => (Protocol::Udp, None, *pid),
                _ => return None,
            };
            let (local_address, local_port) = split_endpoint(parts.get(1)?)?;
            let (remote_address, remote_port) = split_endpoint(parts.get(2)?)?;
            Some(Connection {
                protocol,
                local_address,
                local_port,
                remote_address,
                remote_port,
                state,
                pid: pid.parse().ok(),
            })
        })
        .collect()
}

pub fn proc_state(hex: &str) -> Option<TcpState> {
    Some(match u8::from_str_radix(hex, 16).ok()? {
        0x01 => TcpState::Established,
        0x02 => TcpState::SynSent,
        0x03 => TcpState::SynReceived,
        0x04 => TcpState::FinWait1,
        0x05 => TcpState::FinWait2,
        0x06 => TcpState::TimeWait,
        0x07 => TcpState::Closed,
        0x08 => TcpState::CloseWait,
        0x09 => TcpState::LastAck,
        0x0A => TcpState::Listen,
        0x0B => TcpState::Closing,
        _ => return None,
    })
}

/// `/proc/net` のアドレス（4 バイトごとにリトル エンディアンの 16 進）と、16 進のポートを読む。
pub fn proc_endpoint(text: &str) -> Option<(String, u16)> {
    let (address, port) = text.split_once(':')?;
    let port = u16::from_str_radix(port, 16).ok()?;
    let words: Option<Vec<u32>> = (0..address.len() / 8)
        .map(|i| {
            let word = address.get(i * 8..i * 8 + 8)?;
            u32::from_str_radix(word, 16).ok().map(u32::swap_bytes)
        })
        .collect();
    let words = words?;
    let address = match (address.len(), words.as_slice()) {
        (8, [w]) => Ipv4Addr::from(*w).to_string(),
        (32, [a, b, c, d]) => {
            let bits = (u128::from(*a) << 96)
                | (u128::from(*b) << 64)
                | (u128::from(*c) << 32)
                | u128::from(*d);
            Ipv6Addr::from(bits).to_string()
        }
        _ => return None,
    };
    Some((address, port))
}

/// `/proc/net/{tcp,udp}{,6}` の 1 つを読む。ソケットの inode も返す（PID を探すのに使う）。
pub fn parse_proc_net(content: &str, protocol: Protocol) -> Vec<(Connection, u64)> {
    content
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let (local_address, local_port) = proc_endpoint(parts.get(1)?)?;
            let (remote_address, remote_port) = proc_endpoint(parts.get(2)?)?;
            let state = match protocol {
                Protocol::Tcp => proc_state(parts.get(3)?),
                Protocol::Udp => None,
            };
            let inode = parts.get(9)?.parse().ok()?;
            Some((
                Connection {
                    protocol,
                    local_address,
                    local_port,
                    remote_address,
                    remote_port,
                    state,
                    pid: None,
                },
                inode,
            ))
        })
        .collect()
}

/// `/proc/<pid>/fd/<n>` のリンク先（`socket:[12345]`）からソケットの inode を読む。
pub fn socket_inode(link: &str) -> Option<u64> {
    link.strip_prefix("socket:[")?
        .strip_suffix(']')?
        .parse()
        .ok()
}

#[cfg(windows)]
pub fn list() -> Result<Vec<Connection>, String> {
    let output = std::process::Command::new("netstat")
        .arg("-ano")
        .output()
        .map_err(|e| format!("接続の一覧を取れません（netstat を起動できません）: {e}"))?;
    let mut list = parse_netstat(&String::from_utf8_lossy(&output.stdout));
    list.truncate(MAX_CONNECTIONS);
    Ok(list)
}

#[cfg(not(windows))]
fn socket_owners() -> HashMap<u64, u32> {
    let mut owners = HashMap::new();
    let Ok(procs) = std::fs::read_dir("/proc") else {
        return owners;
    };
    for entry in procs.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|n| n.parse::<u32>().ok())
        else {
            continue;
        };
        let Ok(fds) = std::fs::read_dir(entry.path().join("fd")) else {
            continue;
        };
        for fd in fds.flatten() {
            if let Some(inode) = std::fs::read_link(fd.path())
                .ok()
                .and_then(|l| socket_inode(&l.to_string_lossy()))
            {
                owners.entry(inode).or_insert(pid);
            }
        }
    }
    owners
}

#[cfg(not(windows))]
pub fn list() -> Result<Vec<Connection>, String> {
    let owners = socket_owners();
    let mut list = Vec::new();
    for (file, protocol) in [
        ("tcp", Protocol::Tcp),
        ("tcp6", Protocol::Tcp),
        ("udp", Protocol::Udp),
        ("udp6", Protocol::Udp),
    ] {
        let Ok(content) = std::fs::read_to_string(format!("/proc/net/{file}")) else {
            continue;
        };
        list.extend(
            parse_proc_net(&content, protocol)
                .into_iter()
                .map(|(c, inode)| Connection {
                    pid: owners.get(&inode).copied(),
                    ..c
                }),
        );
    }
    list.truncate(MAX_CONNECTIONS);
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NETSTAT: &str = "\r\nActive Connections\r\n\r\n  Proto  Local Address          Foreign Address        State           PID\r\n\
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1816\r\n\
  TCP    100.64.1.32:49959      40.99.77.146:443       ESTABLISHED     24572\r\n\
  TCP    [::1]:5432             [::]:0                 LISTENING       880\r\n\
  UDP    0.0.0.0:53             *:*                                    4448\r\n\
  UDP    [fe80::1%12]:1900      *:*                                    3344\r\n";

    mod equivalence {
        use super::*;

        #[test]
        fn netstat_lines_become_connections() {
            let list = parse_netstat(NETSTAT);
            assert_eq!(list.len(), 5);
            let est = list.get(1).unwrap();
            assert_eq!(est.protocol, Protocol::Tcp);
            assert_eq!(est.local_address, "100.64.1.32");
            assert_eq!(est.local_port, 49959);
            assert_eq!(est.remote_address, "40.99.77.146");
            assert_eq!(est.remote_port, 443);
            assert_eq!(est.state, Some(TcpState::Established));
            assert_eq!(est.pid, Some(24572));
            let v6 = list.get(2).unwrap();
            assert_eq!(v6.local_address, "::1");
            assert_eq!(v6.state, Some(TcpState::Listen));
            let udp = list.get(4).unwrap();
            assert_eq!(udp.protocol, Protocol::Udp);
            assert_eq!(udp.local_address, "fe80::1%12");
            assert_eq!(udp.remote_address, "*");
            assert_eq!(udp.remote_port, 0);
            assert_eq!(udp.state, None);
        }

        #[test]
        fn proc_addresses_are_little_endian_words() {
            assert_eq!(
                proc_endpoint("0100007F:0277"),
                Some(("127.0.0.1".to_owned(), 631))
            );
            assert_eq!(
                proc_endpoint("00000000000000000000000001000000:1F90"),
                Some(("::1".to_owned(), 8080))
            );
        }

        #[test]
        fn proc_net_lines_have_state_and_inode() {
            let tcp = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n\
   0: 0100007F:0277 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 18938 1 0000000000000000 100 0 0 10 0\n\
   1: 0201A8C0:C350 22B8C2D8:01BB 01 00000000:00000000 00:00000000 00000000  1000        0 55555 1 0000000000000000 20 4 30 10 -1\n";
            let list = parse_proc_net(tcp, Protocol::Tcp);
            assert_eq!(list.len(), 2);
            let (listen, inode) = list.first().unwrap();
            assert_eq!(listen.state, Some(TcpState::Listen));
            assert_eq!(*inode, 18938);
            let (est, _) = list.get(1).unwrap();
            assert_eq!(est.local_address, "192.168.1.2");
            assert_eq!(est.local_port, 50000);
            assert_eq!(est.remote_port, 443);
            assert_eq!(est.state, Some(TcpState::Established));
            let udp = parse_proc_net(tcp, Protocol::Udp);
            assert!(udp.iter().all(|(c, _)| c.state.is_none()));
        }

        #[test]
        fn socket_links_give_inode() {
            assert_eq!(socket_inode("socket:[18938]"), Some(18938));
            assert_eq!(socket_inode("/dev/null"), None);
            assert_eq!(socket_inode("pipe:[1]"), None);
        }

        #[test]
        fn all_tcp_states_are_known() {
            for (hex, state) in [
                ("02", TcpState::SynSent),
                ("03", TcpState::SynReceived),
                ("04", TcpState::FinWait1),
                ("05", TcpState::FinWait2),
                ("06", TcpState::TimeWait),
                ("07", TcpState::Closed),
                ("08", TcpState::CloseWait),
                ("09", TcpState::LastAck),
                ("0B", TcpState::Closing),
            ] {
                assert_eq!(proc_state(hex), Some(state), "{hex}");
            }
            for (name, state) in [
                ("SYN_SENT", TcpState::SynSent),
                ("SYN_RECEIVED", TcpState::SynReceived),
                ("FIN_WAIT_1", TcpState::FinWait1),
                ("FIN_WAIT_2", TcpState::FinWait2),
                ("TIME_WAIT", TcpState::TimeWait),
                ("CLOSE_WAIT", TcpState::CloseWait),
                ("LAST_ACK", TcpState::LastAck),
                ("CLOSING", TcpState::Closing),
                ("CLOSED", TcpState::Closed),
            ] {
                assert_eq!(netstat_state(name), Some(state), "{name}");
            }
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn broken_lines_are_skipped() {
            assert_eq!(
                parse_netstat("  TCP    0.0.0.0    x    LISTENING  1\n"),
                Vec::new()
            );
            assert_eq!(parse_netstat("  Proto  Local\n"), Vec::new());
            assert_eq!(
                parse_proc_net("header\n 0: zz:0 00:0 0A\n", Protocol::Tcp),
                Vec::new()
            );
        }

        #[test]
        fn unknown_states_are_none() {
            assert_eq!(netstat_state("BOUND"), None);
            assert_eq!(proc_state("0C"), None);
            assert_eq!(proc_state("zz"), None);
        }

        #[test]
        fn odd_address_lengths_are_rejected() {
            assert_eq!(proc_endpoint("0100007F"), None);
            assert_eq!(proc_endpoint("01000:0050"), None);
            assert_eq!(proc_endpoint("0100007F:FFFFF"), None);
        }

        #[test]
        fn port_edges() {
            assert_eq!(split_endpoint("0.0.0.0:0"), Some(("0.0.0.0".to_owned(), 0)));
            assert_eq!(
                split_endpoint("0.0.0.0:65535"),
                Some(("0.0.0.0".to_owned(), 65535))
            );
            assert_eq!(split_endpoint("0.0.0.0:65536"), None);
            assert_eq!(split_endpoint("no-port"), None);
        }
    }

    mod system {
        use super::*;

        #[test]
        fn real_connections_have_valid_protocol_states() {
            let list = list().unwrap();
            assert!(list.len() <= MAX_CONNECTIONS);
            assert!(
                list.iter()
                    .all(|c| c.protocol == Protocol::Tcp || c.state.is_none())
            );
        }
    }
}
