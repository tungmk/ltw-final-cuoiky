// src/pages/users/UserPhotos.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Typography,
    Paper,
    CardMedia,
    TextField,
    Button,
    Box,
} from "@mui/material";
import { api, getUser, imageUrl, photoLikesApi } from "../../config/api";
import PhotoComments from "../../components/comments/PhotoComments";
import { formatDate } from "../../utils/format";

export default function UserPhotos() {
    const { userId } = useParams();
    const me = getUser();

    const [photos, setPhotos] = useState(null);
    const [draft, setDraft] = useState({});
    const [submitting, setSubmitting] = useState({});
    const [deleting, setDeleting] = useState({});
    const [liking, setLiking] = useState({});

    const normalizePhoto = useCallback(
        (p) => ({
            ...p,
            comments: p?.comments || [],
            likes: p?.likes || [],
        }),
        []
    );

    const upsertPhoto = useCallback(
        (photo) =>
            setPhotos((prev) => {
                const normalized = normalizePhoto(photo);
                const list = prev || [];
                const idx = list.findIndex((p) => p._id === normalized._id);
                if (idx >= 0) {
                    const next = [...list];
                    next[idx] = normalized;
                    return next;
                }
                return [normalized, ...list];
            }),
        [normalizePhoto]
    );

    useEffect(() => {
        let alive = true;

        (async () => {
            const data = await api.get(`/photosOfUser/${userId}`);
            if (alive) setPhotos((data || []).map(normalizePhoto));
        })();

        return () => {
            alive = false;
        };
    }, [userId, normalizePhoto]);

    useEffect(() => {
        const handleUploaded = (e) => {
            const photo = e.detail;
            if (!photo) return;
            const ownerId = photo.user_id?._id || photo.user_id;
            if (String(ownerId) !== String(userId)) return;
            upsertPhoto(photo);
        };
        window.addEventListener("photouploaded", handleUploaded);
        return () => window.removeEventListener("photouploaded", handleUploaded);
    }, [upsertPhoto, userId]);

    const onChangeDraft = (photoId) => (e) =>
        setDraft((p) => ({ ...p, [photoId]: e.target.value }));

    const submitComment = async (photoId) => {
        const text = (draft[photoId] || "").trim();
        if (!text) return;

        setSubmitting((p) => ({ ...p, [photoId]: true }));
        try {
            const updatedPhoto = await api.post(`/commentsOfPhoto/${photoId}`, {
                comment: text,
            });

            setPhotos((prev) =>
                (prev || []).map((p) => (p._id === photoId ? normalizePhoto(updatedPhoto) : p))
            );

            setDraft((p) => ({ ...p, [photoId]: "" }));
        } catch (e) {
            alert(e.message);
        } finally {
            setSubmitting((p) => ({ ...p, [photoId]: false }));
        }
    };

    const updatePhotoInState = (updatedPhoto) => upsertPhoto(normalizePhoto(updatedPhoto));

    const canDelete = (photo) => {
        if (!me) return false;
        const ownerId = photo.user_id?._id || photo.user_id;
        return me.role === "admin" || String(ownerId) === me._id;
    };

    const isLiked = (photo) => {
        if (!me?._id) return false;
        const likes = photo?.likes || [];
        return likes.some((id) => String(id) === String(me._id));
    };

    const handleDeletePhoto = async (photoId) => {
        if (!window.confirm("Xóa ảnh này?")) return;
        setDeleting((p) => ({ ...p, [photoId]: true }));
        try {
            await api.del(`/photos/${photoId}`);
            setPhotos((prev) => (prev || []).filter((p) => p._id !== photoId));
        } catch (e) {
            alert(e.message);
        } finally {
            setDeleting((p) => ({ ...p, [photoId]: false }));
        }
    };

    const handleEditComment = async (photoId, commentId, text) => {
        const updatedPhoto = await api.put(`/commentsOfPhoto/${photoId}/${commentId}`, {
            comment: text,
        });
        updatePhotoInState(updatedPhoto);
    };

    const handleDeleteComment = async (photoId, commentId) => {
        const updatedPhoto = await api.del(`/commentsOfPhoto/${photoId}/${commentId}`);
        updatePhotoInState(updatedPhoto);
    };

    const toggleLike = async (photoId) => {
        const target = (photos || []).find((p) => p._id === photoId);
        if (!target || !me?._id) return;
        const liked = isLiked(target);
        setLiking((p) => ({ ...p, [photoId]: true }));
        try {
            const updated = liked
                ? await photoLikesApi.unlike(photoId)
                : await photoLikesApi.like(photoId);
            updatePhotoInState(updated);
        } catch (e) {
            alert(e.message);
        } finally {
            setLiking((p) => ({ ...p, [photoId]: false }));
        }
    };

    if (!photos) return <div>Đang tải...</div>;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {photos.map((photo) => (
                <Paper key={photo._id} sx={{ p: 2, maxWidth: 720, mx: "auto" }}>
                    <CardMedia
                        component="img"
                        image={imageUrl(photo.file_name)}
                        alt={photo.file_name}
                        sx={{
                            width: "100%",
                            height: { xs: 240, sm: 360, md: 480 },
                            objectFit: "contain",
                            borderRadius: 2,
                            bgcolor: "grey.100",
                        }}
                    />

                    <Box sx={{ mt: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="caption">{formatDate(photo.date_time)}</Typography>
                        {me && (
                            <Button
                                size="small"
                                variant={isLiked(photo) ? "contained" : "outlined"}
                                color="error"
                                onClick={() => toggleLike(photo._id)}
                                disabled={!!liking[photo._id]}
                            >
                                {isLiked(photo) ? "Bỏ thích" : "Thích"} ({photo.likes?.length || 0})
                            </Button>
                        )}
                    </Box>

                    {canDelete(photo) && (
                        <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
                            <Button
                                size="small"
                                color="error"
                                onClick={() => handleDeletePhoto(photo._id)}
                                disabled={!!deleting[photo._id]}
                            >
                                Xóa
                            </Button>
                        </Box>
                    )}

                    <PhotoComments
                        photoId={photo._id}
                        comments={photo.comments}
                        currentUser={me}
                        onEditComment={handleEditComment}
                        onDeleteComment={handleDeleteComment}
                    />

                    {me && (
                        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Viết bình luận..."
                                value={draft[photo._id] || ""}
                                onChange={onChangeDraft(photo._id)}
                            />
                            <Button
                                variant="contained"
                                onClick={() => submitComment(photo._id)}
                                disabled={!!submitting[photo._id]}
                            >
                                Gửi
                            </Button>
                        </Box>
                    )}
                </Paper>
            ))}
        </Box>
    );
}
