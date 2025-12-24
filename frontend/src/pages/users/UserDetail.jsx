// src/pages/users/UserDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Typography, Paper, Button, Box, Stack, Chip } from "@mui/material";
import { api, friendsApi, getUser } from "../../config/api";

export default function UserDetail() {
    const { userId } = useParams();
    const [user, setUser] = useState(null);
    const [status, setStatus] = useState("loading");
    const [actionLoading, setActionLoading] = useState(false);
    const [friends, setFriends] = useState([]);
    const me = getUser();

    useEffect(() => {
        let alive = true;

        (async () => {
            const data = await api.get(`/user/${userId}`);
            if (alive) setUser(data);
        })();

        return () => {
            alive = false;
        };
    }, [userId]);

    useEffect(() => {
        setStatus("loading");
    }, [userId]);

    useEffect(() => {
        let alive = true;
        if (!me?._id) return undefined;

        (async () => {
            try {
                const [stat, frs] = await Promise.all([
                    friendsApi.status(userId),
                    friendsApi.list(userId),
                ]);
                if (!alive) return;
                setStatus(stat?.status || "none");
                setFriends(frs || []);
            } catch {
                if (!alive) return;
                setStatus("none");
                setFriends([]);
            }
        })();

        return () => {
            alive = false;
        };
    }, [userId, me?._id]);

    const updateStatus = async (action) => {
        if (actionLoading) return;
        setActionLoading(true);
        try {
            const res = await action();
            setStatus(res?.status || "none");
            const frs = await friendsApi.list(userId).catch(() => []);
            setFriends(frs || []);
        } catch (e) {
            alert(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (!user) return <div>Loading...</div>;

    return (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h4" gutterBottom>
                {user.first_name} {user.last_name}
            </Typography>

            <Typography>Địa chỉ: {user.location}</Typography>
            <Typography>Nghề nghiệp: {user.occupation}</Typography>
            <Typography>Mô tả: {user.description}</Typography>

            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
                <Button variant="contained" component={Link} to={`/photos/${user._id}`}>
                    Xem ảnh
                </Button>

                {status === "loading" ? (
                    <Button variant="outlined" disabled>
                        Dang tai...
                    </Button>
                ) : status === "self" ? (
                    <Chip label="Đây là bạn" />
                ) : status === "friends" ? (
                    <Button
                        color="error"
                        variant="outlined"
                        disabled={actionLoading}
                        onClick={() => updateStatus(() => friendsApi.unfriend(userId))}
                    >
                        Huỷ kết bạn
                    </Button>
                ) : status === "incoming" ? (
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                            variant="contained"
                            disabled={actionLoading}
                            onClick={() => updateStatus(() => friendsApi.accept(userId))}
                        >
                            Đồng ý
                        </Button>
                        <Button
                            color="inherit"
                            variant="outlined"
                            disabled={actionLoading}
                            onClick={() => updateStatus(() => friendsApi.reject(userId))}
                        >
                            Từ chối
                        </Button>
                    </Box>
                ) : status === "outgoing" ? (
                    <Button
                        variant="outlined"
                        disabled={actionLoading}
                        onClick={() => updateStatus(() => friendsApi.cancel(userId))}
                    >
                        Đã gửi (huỷ)
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        disabled={actionLoading}
                        onClick={() => updateStatus(() => friendsApi.sendRequest(userId))}
                    >
                        Kết bạn
                    </Button>
                )}
            </Stack>

            {friends.length > 0 && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                        Bạn bè của {user.first_name} ({friends.length})
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {friends.map((f) => (
                            <Chip
                                key={f._id}
                                label={`${f.first_name} ${f.last_name}`}
                                component={Link}
                                to={`/users/${f._id}`}
                                clickable
                                variant="outlined"
                            />
                        ))}
                    </Stack>
                </Box>
            )}
        </Paper>
    );
}
