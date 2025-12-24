// src/pages/protected/Profile.jsx
import React, { useCallback, useEffect, useState } from "react";
import { Paper, Typography, Box, CardMedia, Button, TextField, Stack, Alert } from "@mui/material";
import { Link } from "react-router-dom";
import {
    api,
    friendsApi,
    getUser,
    imageUrl,
    photoLikesApi,
    profileApi,
    setAuth,
    getToken,
} from "../../config/api";
import PhotoComments from "../../components/comments/PhotoComments";
import { formatDate } from "../../utils/format";

export default function Profile() {
    const authUser = getUser();
    const [detail, setDetail] = useState(null);
    const [photos, setPhotos] = useState(null);
    const [deleting, setDeleting] = useState({});
    const [liking, setLiking] = useState({});
    const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [friendAction, setFriendAction] = useState({});
    const [editData, setEditData] = useState({
        first_name: "",
        last_name: "",
        location: "",
        occupation: "",
        description: "",
        login_name: "",
    });
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState("");
    const [editingProfile, setEditingProfile] = useState(false);

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
        if (!authUser?._id) return undefined;

        (async () => {
            try {
                const u = await api.get(`/user/${authUser._id}`);
                if (alive) {
                    setDetail(u);
                    setEditData({
                        first_name: u?.first_name || "",
                        last_name: u?.last_name || "",
                        location: u?.location || "",
                        occupation: u?.occupation || "",
                        description: u?.description || "",
                        login_name: u?.login_name || "",
                    });
                }
            } catch {
                if (alive) setDetail(null);
            }
        })();

        return () => {
            alive = false;
        };
    }, [authUser?._id]);

    useEffect(() => {
        let alive = true;
        if (!authUser?._id) return undefined;

        (async () => {
            try {
                const data = await api.get(`/photosOfUser/${authUser._id}`);
                if (alive) setPhotos((data || []).map(normalizePhoto));
            } catch {
                if (alive) setPhotos([]);
            }
        })();

        return () => {
            alive = false;
        };
    }, [authUser?._id, normalizePhoto]);

    const loadFriends = useCallback(async () => {
        if (!authUser?._id) return;
        setLoadingFriends(true);
        try {
            const frs = await friendsApi.list(authUser._id);
            setFriends(frs || []);
        } catch {
            setFriends([]);
        } finally {
            setLoadingFriends(false);
        }
    }, [authUser?._id]);

    const loadFriendRequests = useCallback(async () => {
        setLoadingRequests(true);
        try {
            const data = await friendsApi.requests();
            setFriendRequests({
                incoming: data?.incoming || [],
                outgoing: data?.outgoing || [],
            });
        } catch {
            setFriendRequests({ incoming: [], outgoing: [] });
        } finally {
            setLoadingRequests(false);
        }
    }, []);

    useEffect(() => {
        loadFriends();
        loadFriendRequests();
    }, [loadFriends, loadFriendRequests]);

    useEffect(() => {
        if (!authUser?._id) return undefined;

        const handleUploaded = (e) => {
            const photo = e.detail;
            if (!photo) return;
            const ownerId = photo.user_id?._id || photo.user_id;
            if (String(ownerId) !== String(authUser._id)) return;
            upsertPhoto(photo);
        };

        window.addEventListener("photouploaded", handleUploaded);
        return () => window.removeEventListener("photouploaded", handleUploaded);
    }, [authUser?._id, upsertPhoto]);

    const canDelete = (photo) => {
        if (!authUser?._id) return false;
        const ownerId = photo.user_id?._id || photo.user_id;
        return authUser.role === "admin" || String(ownerId) === authUser._id;
    };

    const updatePhotoInState = (updatedPhoto) => upsertPhoto(updatedPhoto);

    const handleDelete = async (photoId) => {
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

    const withFriendAction = async (userId, actionFn) => {
        setFriendAction((p) => ({ ...p, [userId]: true }));
        try {
            await actionFn();
            await Promise.all([loadFriends(), loadFriendRequests()]);
        } catch (e) {
            alert(e.message);
        } finally {
            setFriendAction((p) => ({ ...p, [userId]: false }));
        }
    };

    const handleAcceptRequest = (userId) =>
        withFriendAction(userId, () => friendsApi.accept(userId));

    const handleRejectRequest = (userId) =>
        withFriendAction(userId, () => friendsApi.reject(userId));

    const handleCancelOutgoing = (userId) =>
        withFriendAction(userId, () => friendsApi.cancel(userId));

    const handleUnfriend = (userId) =>
        withFriendAction(userId, () => friendsApi.unfriend(userId));

    const isLiked = (photo) => {
        if (!authUser?._id) return false;
        const likes = photo?.likes || [];
        return likes.some((id) => String(id) === String(authUser._id));
    };

    const toggleLike = async (photoId) => {
        const target = (photos || []).find((p) => p._id === photoId);
        if (!target || !authUser?._id) return;
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

    const handleEditChange = (field) => (e) =>
        setEditData((prev) => ({ ...prev, [field]: e.target.value }));

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        setProfileMessage("");
        try {
            const updated = await profileApi.update(editData);
            setDetail(updated);
            setAuth({ token: getToken(), user: { ...authUser, ...updated } });
            setProfileMessage("Đã lưu hồ sơ.");
            setEditingProfile(false);
        } catch (e) {
            setProfileMessage(e?.message || "Lưu hồ sơ thất bại.");
        } finally {
            setSavingProfile(false);
        }
    };

    if (!authUser?._id) {
        return <Typography>Vui lòng đăng nhập để xem hồ sơ của bạn.</Typography>;
    }

    return (
        <Box sx={{ width: "100%", display: "flex", justifyContent: "center", px: 2, py: 2 }}>
            <Box sx={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "7fr 5fr" },
                        gap: 2,
                        alignItems: "start",
                    }}
                >
                    <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                        <Typography variant="h5" gutterBottom>
                            Hồ sơ của bạn
                        </Typography>

                <Typography variant="subtitle1">
                    Xin chào,&nbsp;
                    <b>
                        {authUser?.first_name} {authUser?.last_name}
                    </b>{" "}
                    ({authUser?.role || "user"})
                </Typography>

                {!editingProfile ? (
                    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                        <Typography>Tên đăng nhập: {detail?.login_name}</Typography>
                        <Typography>Họ tên: {detail?.first_name} {detail?.last_name}</Typography>
                        <Typography>Địa chỉ: {detail?.location || "Chưa cập nhật"}</Typography>
                        <Typography>Nghề nghiệp: {detail?.occupation || "Chưa cập nhật"}</Typography>
                        <Typography>Mô tả: {detail?.description || "Chưa cập nhật"}</Typography>

                        <Button variant="outlined" sx={{ mt: 1 }} onClick={() => setEditingProfile(true)}>
                            Sửa hồ sơ
                        </Button>
                        {profileMessage && (
                            <Alert severity="info" sx={{ py: 0, px: 1.5 }}>
                                {profileMessage}
                            </Alert>
                        )}
                    </Box>
                ) : (
                    <Stack spacing={2} sx={{ mt: 2 }}>
                        <TextField
                            label="Tên đăng nhập"
                            value={editData.login_name}
                            onChange={handleEditChange("login_name")}
                            required
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                                label="Họ"
                                value={editData.first_name}
                                onChange={handleEditChange("first_name")}
                                required
                                fullWidth
                            />
                            <TextField
                                label="Tên"
                                value={editData.last_name}
                                onChange={handleEditChange("last_name")}
                                required
                                fullWidth
                            />
                        </Stack>
                        <TextField
                            label="Địa chỉ"
                            value={editData.location}
                            onChange={handleEditChange("location")}
                            fullWidth
                        />
                        <TextField
                            label="Nghề nghiệp"
                            value={editData.occupation}
                            onChange={handleEditChange("occupation")}
                            fullWidth
                        />
                        <TextField
                            label="Mô tả"
                            value={editData.description}
                            onChange={handleEditChange("description")}
                            fullWidth
                            multiline
                            minRows={2}
                        />

                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Button variant="contained" onClick={handleSaveProfile} disabled={savingProfile}>
                                Lưu hồ sơ
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => {
                                    setEditingProfile(false);
                                    setEditData({
                                        first_name: detail?.first_name || "",
                                        last_name: detail?.last_name || "",
                                        location: detail?.location || "",
                                        occupation: detail?.occupation || "",
                                        description: detail?.description || "",
                                        login_name: detail?.login_name || "",
                                    });
                                }}
                                disabled={savingProfile}
                            >
                                Hủy
                            </Button>
                            {profileMessage && (
                                <Alert severity="info" sx={{ py: 0, px: 1.5 }}>
                                    {profileMessage}
                                </Alert>
                            )}
                        </Box>
                    </Stack>
                        )}
                    </Paper>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Lời mời kết bạn
                            </Typography>
                            {loadingRequests ? (
                                <Typography>Đang tải lời mời...</Typography>
                            ) : (
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                    <Box>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Đến với bạn
                                        </Typography>
                                        {friendRequests.incoming.length === 0 ? (
                                            <Typography variant="body2">Chưa có lời mời mới.</Typography>
                                        ) : (
                                            friendRequests.incoming.map((u) => (
                                                <Box
                                                    key={u._id}
                                                    sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
                                                >
                                                    <Typography sx={{ flex: 1 }}>
                                                        {u.first_name} {u.last_name}
                                                    </Typography>
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        onClick={() => handleAcceptRequest(u._id)}
                                                        disabled={!!friendAction[u._id]}
                                                    >
                                                        Chấp nhận
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => handleRejectRequest(u._id)}
                                                        disabled={!!friendAction[u._id]}
                                                    >
                                                        Từ chối
                                                    </Button>
                                                </Box>
                                            ))
                                        )}
                                    </Box>

                                    <Box>
                                        <Typography variant="subtitle2" color="text.secondary">
                                            Bạn đã gửi
                                        </Typography>
                                        {friendRequests.outgoing.length === 0 ? (
                                            <Typography variant="body2">Chưa có yêu cầu đang chờ.</Typography>
                                        ) : (
                                            friendRequests.outgoing.map((u) => (
                                                <Box
                                                    key={u._id}
                                                    sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
                                                >
                                                    <Typography sx={{ flex: 1 }}>
                                                        {u.first_name} {u.last_name}
                                                    </Typography>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => handleCancelOutgoing(u._id)}
                                                        disabled={!!friendAction[u._id]}
                                                    >
                                                        Hủy
                                                    </Button>
                                                </Box>
                                            ))
                                        )}
                                    </Box>
                                </Box>
                            )}
                        </Paper>

                        <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Bạn bè ({friends.length})
                            </Typography>
                            {loadingFriends ? (
                                <Typography>Đang tải danh sách bạn bè...</Typography>
                            ) : friends.length === 0 ? (
                                <Typography>Chưa có bạn bè. Hãy gửi lời mời kết bạn!</Typography>
                            ) : (
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                    {friends.map((f) => (
                                        <Box
                                            key={f._id}
                                            sx={{ display: "flex", alignItems: "center", gap: 1 }}
                                        >
                                            <Typography
                                                sx={{ flex: 1 }}
                                                component={Link}
                                                to={`/users/${f._id}`}
                                                color="primary"
                                                style={{ textDecoration: "none" }}
                                            >
                                                {f.first_name} {f.last_name}
                                            </Typography>
                                            <Button
                                                size="small"
                                                color="error"
                                                variant="outlined"
                                                onClick={() => handleUnfriend(f._id)}
                                                disabled={!!friendAction[f._id]}
                                            >
                                                Hủy kết bạn
                                            </Button>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </Paper>
                    </Box>
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                    <Typography variant="h6" sx={{ alignSelf: "flex-start" }}>
                        Ảnh của bạn
                    </Typography>
                    {photos === null && <Typography>Đang tải ảnh...</Typography>}
                    {photos?.length === 0 && <Typography>Chưa có ảnh nào.</Typography>}

                    {photos?.map((photo) => (
                        <Paper
                            key={photo._id}
                            sx={{
                                p: 2,
                                borderRadius: 3,
                                boxShadow: 1,
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                width: "100%",
                                maxWidth: 900,
                            }}
                        >
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="caption">{formatDate(photo.date_time)}</Typography>
                                {authUser && (
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
                                {canDelete(photo) && (
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        onClick={() => handleDelete(photo._id)}
                                        disabled={!!deleting[photo._id]}
                                    >
                                        Xóa
                                    </Button>
                                )}
                            </Box>

                            <CardMedia
                                component="img"
                                image={imageUrl(photo.file_name)}
                                alt={photo.file_name}
                                sx={{
                                    width: "100%",
                                    height: { xs: 260, sm: 340, md: 420 },
                                    objectFit: "contain",
                                    borderRadius: 2,
                                    bgcolor: "grey.100",
                                }}
                            />

                            <PhotoComments
                                photoId={photo._id}
                                comments={photo.comments}
                                currentUser={authUser}
                                onEditComment={handleEditComment}
                                onDeleteComment={handleDeleteComment}
                            />
                        </Paper>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}
