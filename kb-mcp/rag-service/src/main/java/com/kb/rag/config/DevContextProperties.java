package com.kb.rag.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "app.dev-context")
public class DevContextProperties {

    /**
     * MVP/dev fallback user context. PHASE2/3 should replace this with JWT/OBO claims.
     */
    private String userId = "current-user";
    private int secLevel = 5;
    private List<Long> permGroupIds = new ArrayList<>(List.of(1L));
    private List<String> userGroups = new ArrayList<>();

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public int getSecLevel() {
        return secLevel;
    }

    public void setSecLevel(int secLevel) {
        this.secLevel = secLevel;
    }

    public List<Long> getPermGroupIds() {
        return permGroupIds;
    }

    public void setPermGroupIds(List<Long> permGroupIds) {
        this.permGroupIds = permGroupIds;
    }

    public List<String> getUserGroups() {
        return userGroups;
    }

    public void setUserGroups(List<String> userGroups) {
        this.userGroups = userGroups;
    }
}
