// Domain types for Little Loop. Single source of truth for the
// schema that is mirrored in IndexedDB via Dexie.

export type Cadence = "daily" | "weekly";

export interface Project {
  id: string;
  childName: string;
  dateOfBirth: string; // YYYY-MM-DD
  cadence: Cadence;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface Entry {
  id: string;
  projectId: string;
  periodKey: string; // "YYYY-MM-DD" for daily OR Monday-of-week for weekly
  capturedDate: string; // YYYY-MM-DD (date the photo represents)
  imageBlobId: string;
  thumbnailBlobId: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetType = "image" | "thumbnail";

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
  blob: Blob;
  createdAt: string;
}

export interface EntryWithThumb extends Entry {
  thumbnailUrl: string;
}

export interface EntryWithImage extends EntryWithThumb {
  imageUrl: string;
}

export interface StorageStats {
  photoCount: number;
  bytesUsed: number;
}