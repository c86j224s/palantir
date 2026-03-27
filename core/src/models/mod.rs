use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PodInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub node: String,
    pub creation_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceInfo {
    pub name: String,
    pub namespace: String,
    pub kind: String,
    pub status: String,
    pub creation_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}
