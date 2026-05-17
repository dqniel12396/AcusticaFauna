from pydantic import BaseModel


class CuratedImportRequest(BaseModel):
    dataset_root: str


class CuratedReviewRequest(BaseModel):
    reviewed_label: str | None = None
    review_status: str
    reviewer: str | None = None
    notes: str | None = None
