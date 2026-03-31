use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CrdInfo {
    pub name: String,       // "foos.example.com"
    pub group: String,      // "example.com"
    pub kind: String,       // "Foo"
    pub plural: String,     // "foos" (spec.names.plural 의 정확한 값)
    pub scope: String,      // "Namespaced" | "Cluster"
    pub version: String,    // storage:true 버전 (기본 선택)
    pub versions: Vec<String>, // served:true 버전 전체 목록 (storage 버전이 맨 앞)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EphemeralContainerInfo {
    pub name: String,
    pub image: String,
    pub state: String, // Running, Terminated, Waiting
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PodInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub node: String,
    pub creation_timestamp: Option<chrono::DateTime<chrono::Utc>>,
    pub ephemeral_containers: Vec<EphemeralContainerInfo>,
}


#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceInfo {
    pub name: String,
    pub namespace: String,
    pub kind: String,
    pub status: String,
    pub creation_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}
