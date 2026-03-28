use futures::{StreamExt, TryStreamExt};
use kube::{Api, api::{WatchParams, WatchEvent}, ResourceExt};
use k8s_openapi::api::core::v1::Event;
use crate::client::K8sClient;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct K8sEventInfo {
    pub name: String,
    pub namespace: String,
    pub reason: String,
    pub message: String,
    pub type_: String,
    pub object_kind: String,
    pub object_name: String,
    pub count: i32,
    pub first_timestamp: Option<chrono::DateTime<chrono::Utc>>,
    pub last_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn stream_events<F>(
    client: &K8sClient,
    namespace: Option<&str>,
    mut on_event: F,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> 
where 
    F: FnMut(K8sEventInfo) + Send + 'static
{
    let events: Api<Event> = match namespace {
        Some(ns) => Api::namespaced(client.client.clone(), ns),
        None => Api::all(client.client.clone()),
    };

    // WatchParams 사용 (kube 0.90 규격)
    let wp = WatchParams::default();
    let mut stream = events.watch(&wp, "0").await?.boxed();

    while let Some(status) = stream.try_next().await? {
        match status {
            WatchEvent::Added(e) | WatchEvent::Modified(e) => {
                let info = K8sEventInfo {
                    name: e.name_any(),
                    namespace: e.namespace().unwrap_or_default(),
                    reason: e.reason.clone().unwrap_or_default(),
                    message: e.message.clone().unwrap_or_default(),
                    type_: e.type_.clone().unwrap_or_default(),
                    object_kind: e.involved_object.kind.clone().unwrap_or_default(),
                    object_name: e.involved_object.name.clone().unwrap_or_default(),
                    count: e.count.unwrap_or(1),
                    first_timestamp: e.first_timestamp.map(|t| t.0),
                    last_timestamp: e.last_timestamp.map(|t| t.0),
                };
                on_event(info);
            },
            WatchEvent::Error(e) => {
                eprintln!("⚠️ [Watcher] Event error: {:?}", e);
            },
            _ => {}
        }
    }

    Ok(())
}
